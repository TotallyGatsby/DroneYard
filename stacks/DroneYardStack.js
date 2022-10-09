/* eslint-disable import/no-extraneous-dependencies */
import { Bucket } from '@serverless-stack/resources';
import * as batch from '@aws-cdk/aws-batch-alpha';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import * as iam from 'aws-cdk-lib/aws-iam';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Duration } from 'aws-cdk-lib';

const fs = require('fs');
const path = require('path');
const awsConfig = require('../awsconfig.json');

// eslint-disable-next-line no-underscore-dangle
const __dirname = path.resolve();

export default function DroneYardStack({ stack }) {
  // Create our AWS Batch resources
  // Create VPC, so this project won't interfere with other things
  const vpc = ec2.Vpc.fromLookup(stack, 'VPC', {
    // This imports the default VPC but you can also
    // specify a 'vpcName' or 'tags'.
    isDefault: true,
  });

  // Create our launch template (mainly we need to attach the userdata.sh script as user data)
  const userData = fs.readFileSync('./userdata.sh', 'base64').toString();
  const launchTemplate = new ec2.CfnLaunchTemplate(stack, 'DroneYardLaunchTemplate', {
    launchTemplateName: 'DroneYardLaunchTemplate',
    launchTemplateData: {
      userData,
    },
  });

  // Get the latest GPU or Standard AMI
  let image;
  if (awsConfig.computeEnv.useGpu) {
    image = ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.GPU);
  } else {
    image = ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.ARM);
  }

  // Compute environment
  const dockerRole = new iam.Role(stack, 'instance-role', {
    assumedBy: new iam.ServicePrincipal('ec2.amazonaws.com'),
    description: 'Execution role for the docker container, has access to the DroneYard S3 bucket',
    managedPolicies: [iam.ManagedPolicy.fromAwsManagedPolicyName('service-role/AmazonEC2ContainerServiceforEC2Role')],
  });

  const instanceProfile = new iam.CfnInstanceProfile(stack, 'instance-profile', {
    instanceProfileName: 'instance-profile',
    roles: [dockerRole.roleName],
  });

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

  // Create our AWS Batch job queue
  const jobQueue = new batch.JobQueue(stack, 'DroneYardJobQueue', {
    computeEnvironments: [
      {
        // Defines a collection of compute resources to handle assigned batch jobs
        computeEnvironment: awsManagedEnvironment,
        order: 1,
      },
    ],
  });

  // Create our guest image (e.g. the docker image)
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
      // TODO: Create the docker image in ECR?
      logConfiguration: {
        logDriver: batch.LogDriver.AWSLOGS,
      },
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
    notifications: {
      dispatch_notification: {
        function: 'functions/dispatch_batch_job.handler',
        events: ['object_created'], // TODO: Consider whether tags make more sense than files?
        filters: [{ suffix: 'dispatch' }],
      },
    },
  });

  dronePhotosBucket.attachPermissions(['s3', 'batch']);
  dronePhotosBucket.cdk.bucket.grantReadWrite(dockerRole);

  // Console outputs
  stack.addOutputs({
    BucketName: dronePhotosBucket.bucketName,
    BucketArn: dronePhotosBucket.bucketArn,
    ComputeEnvironment: awsManagedEnvironment.computeEnvironmentArn,
  });
}
