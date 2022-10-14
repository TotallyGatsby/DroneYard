import AWS from 'aws-sdk';
import log from 'npmlog';

const Batch = new AWS.Batch();
/* eslint-disable import/prefer-default-export */
export const handler = async (event) => {
  log.info('Execution', `Beginning dispatch_batch_job execution. ${JSON.stringify(event)}`);

  // Get the S3 path(s) -- multiple possible records can come in one invocation
  const jobPaths = [];

  event.Records.forEach((record) => {
    // extract the bucket / key
    const key = record.s3.object.key.replace(/\/dispatch$/, '');

    jobPaths.push({
      name: record.s3.bucket.name,
      key,
    });

    log.info('Execution', `Found new prefix ${record.s3.bucket.name}, ${key}`);
  });

  // Create an AWS batch job to process each path
  await Promise.all(jobPaths.map(async (path) => {
    log.info('Execution', `Sending batch job for ${JSON.stringify(path)}`);

    const params = {
      jobDefinition: process.env.JOB_DEFINITION,
      jobName: `DroneYard-${path.key}`,
      jobQueue: process.env.JOB_QUEUE,
      parameters: {
        bucket: path.name,
        key: path.key,
      },
      retryStrategy: {
        attempts: 1,
      },
    };

    log.info('Execution', `Launching with params: ${JSON.stringify(params)}`);
    try {
      const results = await Batch.submitJob(params).promise();
      log.info('Execution', JSON.stringify(results)); // successful response)
    } catch (err) {
      log.error('Execution', err.message);
    }
  }));

  return {
    statusCode: 200,
    headers: { 'Content-Type': 'text/plain' },
    body: `Beginning the dispatch of a batch job at ${event}.`,
  };
};
