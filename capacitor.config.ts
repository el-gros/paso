import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.elgros.paso',
  appName: 'paso',
  webDir: 'www',
  server: {
    androidScheme: 'https'
  },
  //  bundledWebRuntime: false
  plugins: {
    CapacitorSQLite: {
      iosDatabaseLocation: 'Library/CapacitorDatabase',
      iosIsEncryption: true,
      iosKeychainPrefix: 'angular-sqlite-app-starter',
      iosBiometric: {
        biometricAuth: false,
        biometricTitle : "Biometric login for capacitor sqlite"
      },
      androidIsEncryption: false,
      androidBiometric: {
        biometricAuth : false,
        biometricTitle : "Biometric login for capacitor sqlite",
        biometricSubTitle : "Log in using your biometric"
      },
      electronIsEncryption: false,
      electronWindowsLocation: "C:\\ProgramData\\CapacitorDatabases",
      electronMacLocation: "/Volumes/Development_Lacie/Development/Databases",
      electronLinuxLocation: "Databases"
    },
    SplashScreen: {
      launchShowDuration: 1000,
      launchAutoHide: true,
      launchFadeOutDuration: 1000,
      backgroundColor: "#ffffffff",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: true,
      androidSpinnerStyle: "large",
      iosSpinnerStyle: "small",
      spinnerColor: "#999999",
      splashFullScreen: true,
      splashImmersive: true,
      layoutName: "launch_screen",
      useDialog: true,
    },
    Http: {
      allowClearText: true, // Enable HTTP (non-HTTPS) requests
    },
    CapacitorHttp: {
      enabled: true,
    }
  },
};

export default config;



