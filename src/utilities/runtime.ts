let isLambdaDeployment = false;

export const configureRuntime = ({ isLambda = false } = {}) => {
  isLambdaDeployment = isLambda;
};

export const awsConfig = (region: string) => ({ region });

export const isLambda = () => isLambdaDeployment;