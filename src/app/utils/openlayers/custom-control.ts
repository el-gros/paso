import Control from 'ol/control/Control';
import Feature from 'ol/Feature';
import Point from 'ol/geom/Point';
import { Icon, Style } from 'ol/style';
import { FunctionsService } from '../../services/functions.service';

export class CustomControl extends Control {
  private button: HTMLButtonElement;
  private positionFeature: Feature<Point>;

  private isActive = true;

  private sharpIcon = 'assets/icons/navigate-sharp-blue.svg';
  private outlineIcon = 'assets/icons/navigate-outline-blue.svg';

  /** Callbacks */
  private activateCallback?: () => void;
  private deactivateCallback?: () => void;

  constructor(private fs: FunctionsService) {
    const element = document.createElement('div');
    element.className = 'ol-unselectable ol-control custom-control';

    const button = document.createElement('button');
    button.style.width = '30px';
    button.style.height = '30px';
    button.style.border = 'none';
    button.style.borderRadius = '50%';
    button.style.backgroundColor = 'white';
    button.style.display = 'flex';
    button.style.justifyContent = 'center';
    button.style.alignItems = 'center';
    button.style.cursor = 'pointer';
    button.innerHTML = `<img src="assets/icons/navigate-sharp-blue.svg" style="width:22px;height:22px;" />`;

    element.appendChild(button);

    super({ element });
    this.button = button;

    // Handle clicks
    this.button.addEventListener('click', () => this.handleClick());

    // Marker feature
    this.positionFeature = new Feature();
    this.setMarkerIcon(this.sharpIcon);
    this.fs.locationLayer?.getSource()?.addFeature(this.positionFeature);
  }

  /** Public API for listening */
  public onActivate(cb: () => void) {
    this.activateCallback = cb;
  }

  public onDeactivate(cb: () => void) {
    this.deactivateCallback = cb;
  }

  /** -------- BUTTON CLICK LOGIC -------- */
  private handleClick() {
    if (this.isActive) {
      this.isActive = false;
      this.setButtonIcon(this.outlineIcon);
      this.deactivateCallback?.();
    } else {
      this.isActive = true;
      this.setButtonIcon(this.sharpIcon);
      this.activateCallback?.();
    }
  }

  /** -------- ICON HANDLING -------- */
  private setButtonIcon(iconPath: string) {
    this.button.innerHTML =
      `<img src="${iconPath}" style="width:22px;height:22px;" />`;
  }

  private setMarkerIcon(iconPath: string) {
    const style = new Style({
      image: new Icon({
        src: iconPath,
        size: [48, 48],
        anchor: [0.5, 0.5],
        rotateWithView: true,
        crossOrigin: 'anonymous',
      }),
    });
    this.positionFeature.setStyle(style);
  }
}
