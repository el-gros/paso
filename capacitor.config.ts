import { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'io.elgros.paso',
  appName: 'paso',
  webDir: 'www/browser',
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
      launchShowDuration: 5000, // 👈 Ponle 5000 (5 seg) como red de seguridad
      launchAutoHide: false,    // 👈 🔴 CAMBIA A FALSE (Tú decides cuándo se oculta)
      launchFadeOutDuration: 1000, // Mantiene el efecto de desvanecimiento suave
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



