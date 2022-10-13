/* eslint-disable import/no-extraneous-dependencies */
import { Bucket } from '@serverless-stack/resources';
import * as batch from '@aws-cdk/aws-batch-alpha';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as s3Deploy from 'aws-cdk-lib/aws-s3-deployment';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Duration } from 'aws-cdk-lib';

const fs = require('fs');
const path = require('path');
const awsConfig = require('../awsconfig.json');

// eslint-disable-next-line no-underscore-dangle
const __dirname = path.resolve();

export default function DroneYardStack({ app, stack }) {
  // Get the default VPC
  const vpc = ec2.Vpc.fromLookup(stack, 'VPC', {
    // This imports the default VPC but you can also
    // specify a 'vpcName' or 'tags'.
    isDefault: true,
  });

  // Create our launch template (mainly we need to attach the userdata.sh script as user data)
  const userData = fs.readFileSync('./userdata.sh', 'base64').toString();
  const launchTemplate = new ec2.CfnLaunchTemplate(stack, 'DroneYardLaunchTemplate', {
    launchTemplateName: `${app.stage}-DroneYardLaunchTemplate`,
    launchTemplateData: {
      userData,
    },
  });

  // Get the latest GPU or ARM AMI for our EC2 container host.
  // TODO: This could figure out the instance type to determine which AMI to get
  let image;
  if (awsConfig.computeEnv.useGpu) {
    image = ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.GPU);
  } else {
    image = ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.ARM);
  }

  // Create the IAM role so the docker container can access S3. (These are the permissions on the
  // instance that the Spot request spins up.)
  const dockerRole = new iam.Role(stack, 'instance-role', {
    assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    description: 'Execution role for the docker container, has access to the DroneYard S3 bucket',
    managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2ContainerServiceforEC2Role')],
  });

  const instanceProfile = new iam.CfnInstanceProfile(stack, 'instance-profile', {
    instanceProfileName: `${app.stage}-DroneYard-instance-profile`,
    roles: [dockerRole.roleName],
  });

  // Compute environment (AWS Batch Resources)
  const awsManagedEnvironment = new batch.ComputeEnvironment(stack, 'DroneYardComputeEnvironment', {
    computeResources: {
      type: batch.ComputeResourceType.SPOT,
      bidPercentage: awsConfig.computeEnv.bidPercentage,
      minvCpus: awsConfig.computeEnv.minvCpus,
      maxvCpus: awsConfig.computeEnv.maxvCpus,
      instanceTypes: awsConfig.computeEnv.instanceTypes,
      instanceRole: instanceProfile.attrArn,
      vpc,
      image,
      launchTemplate: {
        launchTemplateName: launchTemplate.launchTemplateName,
      },
    },
  });

  // Create our AWS Batch job queue and connect it to the compute environment
  const jobQueue = new batch.JobQueue(stack, 'DroneYardJobQueue', {
    computeEnvironments: [
      {
        // Defines a collection of compute resources to handle assigned batch jobs
        computeEnvironment: awsManagedEnvironment,
        order: 1,
      },
    ],
  });

  // Create our guest image (e.g. the docker image from the DockerFile)
  const dockerImage = new DockerImageAsset(stack, 'DroneYardDockerImage', {
    directory: path.join(__dirname, awsConfig.computeEnv.useGpu ? 'dockergpu' : 'docker'),
  });

  // Create our AWS Batch Job Definition
  const jobDefinition = new batch.JobDefinition(stack, 'DroneYardJobDefinition', {
    container: {
      command: [
        'sh',
        '-c',
        '/entry.sh',
        'Ref::bucket',
        'Ref::key',
        'output',
      ],
      gpuCount: awsConfig.computeEnv.useGpu ? 1 : 0,
      image: ecs.ContainerImage.fromDockerImageAsset(dockerImage),
      logConfiguration: {
        logDriver: batch.LogDriver.AWSLOGS,
      },
      // TODO: Probably could set this dynamically or make it a part of the config
      memoryLimitMiB: 120000,
      mountPoints: [{
        containerPath: '/local',
        readOnly: false,
        sourceVolume: 'local',
      }],
      privileged: true,
      vcpus: 0,
      volumes: [{
        name: 'local',
        host: {
          sourcePath: '/local',
        },
      }],
    },
    // TODO: Make this configurable
    timeout: Duration.hours(24),
  });

  // Storage for inputs and outputs from Open Drone Map
  // When the s3 bucket receives a 'dispatch' file, it will kick off the process
  const dronePhotosBucket = new Bucket(stack, 'DronePhotos', {
    defaults: {
      function: {
        environment: {
          JOB_DEFINITION: jobDefinition.jobDefinitionName,
          JOB_QUEUE: jobQueue.jobQueueName,
        },
      },
    },

    // Trigger this lambda when a file ending in 'dispatch' is uploaded to an S3 directory
    notifications: {
      dispatch_notification: {
        function: 'functions/dispatch_batch_job.handler',
        // TODO: Consider whether triggering on tags make more sense than files?
        events: ['object_created'],
        filters: [{ suffix: 'dispatch' }],
      },
    },
  });

  // Set permissions on the bucket
  dronePhotosBucket.attachPermissions(['s3', 'batch']);
  dronePhotosBucket.cdk.bucket.grantReadWrite(dockerRole);

  // Upload the settings.yaml file
  // eslint-disable-next-line no-new
  new s3Deploy.BucketDeployment(stack, 'settings yaml', {
    sources: [s3Deploy.Source.asset(__dirname, { exclude: ['**', '.*', '!settings.yaml'] })],
    destinationBucket: dronePhotosBucket.cdk.bucket,
  });

  // Console outputs
  stack.addOutputs({
    BucketName: dronePhotosBucket.bucketName,
    BucketArn: dronePhotosBucket.bucketArn,
    ComputeEnvironment: awsManagedEnvironment.computeEnvironmentArn,
  });
}
