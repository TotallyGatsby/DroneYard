// eslint-disable-next-line import/no-extraneous-dependencies
import { Api, Bucket } from '@serverless-stack/resources';

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

  // Create the API for dispatching an AWS batch job, should not be callable directly
  // only from S3 events
  const api = new Api(stack, 'api', {
    routes: {
      'GET /': 'functions/dispatch_batch_job.handler',
    },
  });

  // Console outputs
  stack.addOutputs({
    ApiEndpoint: api.url,
    BucketName: dronePhotosBucket.bucketName,
    BucketArn: dronePhotosBucket.bucketArn,
  });
}
