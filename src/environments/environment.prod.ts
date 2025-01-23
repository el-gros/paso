import { TrackDefinition } from "src/globald";

export var global: any = {
  lag: 8 as number,
  layerVisibility: 'archived' as string,
  language: 'other' as 'ca' | 'es' | 'other',
  languageIndex: 2 as 0 | 1 | 2,
  archivedPresent: false as boolean,
  cancel: ['Cancel.lar', 'Cancelar', 'Cancel'],
  currentColor: 'orange' as string, 
  archivedColor: 'green' as string,
  collection: [] as TrackDefinition [],
  key: 'null' as string,
  comingFrom: '' as string,
  fontSize: 16 as number,
  deleteSearch: false as boolean,
  presentSearch: false as boolean,
  locationUpdate: false as boolean,
  
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
  production: true,
};