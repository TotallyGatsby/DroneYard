import DroneYardStack from './DroneYardStack';

export default function setupApp(app) {
  app.setDefaultFunctionProps({
    runtime: 'nodejs16.x',
    srcPath: 'services',
    bundle: {
      format: 'esm',
    },
  });
  app.stack(DroneYardStack);
}
