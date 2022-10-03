/* eslint-disable import/no-extraneous-dependencies */
import { Api, Bucket } from '@serverless-stack/resources';
import * as batch from '@aws-cdk/aws-batch-alpha';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';
import { DockerImageAsset } from 'aws-cdk-lib/aws-ecr-assets';
import { Duration } from 'aws-cdk-lib';

const fs = require('fs');
const path = require('path');
const awsConfig = require('../awsconfig.json');

// eslint-disable-next-line no-underscore-dangle
const __dirname = path.resolve();

export default function DroneYardStack({ stack }) {
  // TODO: Create the API for dispatching an AWS batch job, should not be callable directly
  // only from S3 events, so this probably will get deleted in the future
  const api = new Api(stack, 'api', {
    routes: {
      'GET /': 'functions/dispatch_batch_job.handler',
    },
  });

  // Create our AWS Batch resources
  // Create VPC, so this project won't interfere with other things
  const vpc = new ec2.Vpc(stack, 'DroneYardVPC');

  // Create our launch template (mainly we need to attach the userdata.sh script as user data)
  const userData = fs.readFileSync('./userdata.sh', 'base64').toString();
  const launchTemplate = new ec2.CfnLaunchTemplate(stack, 'DroneYardLaunchTemplate', {
    launchTemplateName: 'DroneYardLaunchTemplate',
    launchTemplateData: {
      userData,
    },
  });

  // Get the latest GPU AMI
  const image = ecs.EcsOptimizedImage.amazonLinux2(ecs.AmiHardwareType.GPU);

  // Compute environment
  const awsManagedEnvironment = new batch.ComputeEnvironment(stack, 'DroneYardComputeEnvironment', {
    computeResources: {
      type: batch.ComputeResourceType.SPOT,
      bidPercentage: awsConfig.computeEnv.bidPercentage,
      minvCpus: awsConfig.computeEnv.minvCpus,
      maxvCpus: awsConfig.computeEnv.maxvCpus,
      instanceTypes: awsConfig.computeEnv.instanceTypes,
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
    directory: path.join(__dirname, 'docker'),
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
      gpuCount: 1,
      image: ecs.ContainerImage.fromEcrRepository(
        dockerImage.repository,
        'latest',
      ),
      // TODO: Create the docker image in ECR?
      logConfiguration: {
        logDriver: batch.LogDriver.AWSLOGS,
      },
      memoryLimitMiB: 256000,
      mountPoints: [{
        containerPath: '/local',
        readOnly: false,
        sourceVolume: 'local',
      }],
      privileged: true,
      vcpus: 16,
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

  // Console outputs
  stack.addOutputs({
    ApiEndpoint: api.url,
    BucketName: dronePhotosBucket.bucketName,
    BucketArn: dronePhotosBucket.bucketArn,
    ComputeEnvironment: awsManagedEnvironment.computeEnvironmentArn,
  });
}
