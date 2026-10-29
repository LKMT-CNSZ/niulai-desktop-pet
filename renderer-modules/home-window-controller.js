export class HomeWindowController {
  constructor(desktopPet) {
    this.desktopPet = desktopPet;
  }

  setThreeDimensional(enabled, settings) {
    this.desktopPet?.setRoamingMode?.(enabled, settings);
  }

  reset() {
    return this.desktopPet?.resetWindowPosition?.();
  }

  recallRoaming() {
    return this.desktopPet?.recallRoaming?.();
  }

  wakeRoaming() {
    return this.desktopPet?.wakeRoaming?.();
  }
}
