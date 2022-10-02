/* eslint-disable import/no-extraneous-dependencies */
import { Api, Bucket } from '@serverless-stack/resources';
import * as batch from '@aws-cdk/aws-batch-alpha';
import * as ec2 from 'aws-cdk-lib/aws-ec2';
import * as ecs from 'aws-cdk-lib/aws-ecs';

const fs = require('fs');
const awsConfig = require('../awsconfig.json');

export default function DroneYardStack({ stack }) {
  // Storage for inputs and outputs from Open Drone Map
  // When the s3 bucket receives a 'dispatch' file, it will kick off the process
  const dronePhotosBucket = new Bucket(stack, 'DronePhotos', {
    notifications: {
      dispatch_notification: {
        function: 'functions/dispatch_batch_job.handler',
        events: ['object_created'], // TODO: Consider whether tags make more sense than files?
        filters: [{ suffix: 'dispatch' }],
      },
    },
  });

  dronePhotosBucket.attachPermissions(['s3']);

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

  // Create our job queue
  const jobQueue = new batch.JobQueue(stack, 'DroneYardJobQueue', {
    computeEnvironments: [
      {
        // Defines a collection of compute resources to handle assigned batch jobs
        computeEnvironment: awsManagedEnvironment,
        order: 1,
      },
    ],
  });

  // Console outputs
  stack.addOutputs({
    ApiEndpoint: api.url,
    BucketName: dronePhotosBucket.bucketName,
    BucketArn: dronePhotosBucket.bucketArn,
    ComputeEnvironment: awsManagedEnvironment.computeEnvironmentArn,
  });
}
