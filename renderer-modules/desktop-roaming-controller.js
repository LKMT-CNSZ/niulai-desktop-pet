export class DesktopRoamingController {
  constructor(desktopPet) {
    this.desktopPet = desktopPet;
  }

  setMarketState(state) {
    this.desktopPet?.setRoamingState?.(state);
  }

  sendAction(action) {
    this.desktopPet?.sendPetAction?.(action);
  }

  setHitRegion(region) {
    this.desktopPet?.setRoamingHitRegion?.(region);
  }

  beginDrag() {
    this.desktopPet?.beginRoamingDrag?.();
  }

  endDrag() {
    this.desktopPet?.endRoamingDrag?.();
  }
}
