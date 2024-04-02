import type { SSTConfig } from "sst"
import DroneYardStack from './stacks/DroneYardStack';

export default {
  config(input) {
    return {
      name: "drone-yard",
      region: "us-west-2",
    }
  },
  stacks(app) {
    app.setDefaultFunctionProps({
      runtime: 'nodejs16.x',
      nodejs: {
        format: 'esm',
      },
    });
    app.stack(DroneYardStack);
  },
} satisfies SSTConfig