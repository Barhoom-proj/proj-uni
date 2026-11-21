import { Amplify } from 'aws-amplify';

export const isCognitoConfigured = Boolean(
  import.meta.env.VITE_COGNITO_USER_POOL_ID &&
  import.meta.env.VITE_COGNITO_APP_CLIENT_ID
);

export const isAttendanceApiConfigured = Boolean(import.meta.env.VITE_API_BASE_URL);

if (isCognitoConfigured) {
  Amplify.configure({
    Auth: {
      Cognito: {
        userPoolId: import.meta.env.VITE_COGNITO_USER_POOL_ID,
        userPoolClientId: import.meta.env.VITE_COGNITO_APP_CLIENT_ID,
        loginWith: { email: true },
      },
    },
  });
}

console.log("AWS Configuration Check:", {
  userPoolLoaded: Boolean(
    import.meta.env.VITE_COGNITO_USER_POOL_ID
  ),
  appClientLoaded: Boolean(
    import.meta.env.VITE_COGNITO_APP_CLIENT_ID
  ),
  cognitoEnabled: isCognitoConfigured
});
