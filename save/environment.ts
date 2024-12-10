// This file can be replaced during build by using the `fileReplacements` array.
// `ng build` replaces `environment.ts` with `environment.prod.ts`.
// The list of file replacements can be found in `angular.json`.

export var global: any = {
  lag: 8 as number,
  layerVisibility: 'archived' as string,
  language: 'other' as 'ca' | 'es' | 'other',
  languageIndex: 2 as 0 | 1 | 2,
  archivedPresent: false as boolean,
  cancel: ['Cancel.lar', 'Cancelar', 'Cancel'] as string[],
  currentColor: 'orange' as string, 
  archivedColor: 'green' as string,

  // Dynamic getter for the cancel button
  get cancelButton() {
    return {
      text: this.cancel[this.languageIndex], // Dynamically fetch the text
      role: 'cancel',
      cssClass: 'alert-cancel-button',
      handler: () => {
        // Optional handler logic can go here
      }
    };
  }
};

export const environment = {
  production: false,
};