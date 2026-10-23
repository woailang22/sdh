/** Short-lived state preimages; never copies untouched world collections. */
export class TickUndo {
  private undos: (() => void)[] = [];
  private captured = new WeakSet<object>();
  object(value: object) {
    if (this.captured.has(value)) return;
    const before = JSON.parse(JSON.stringify(value));
    this.captured.add(value);
    this.undos.push(() => {
      for (const key of Object.keys(value)) Reflect.deleteProperty(value, key);
      Object.assign(value, before);
    });
  }
  entry(target: object, key: PropertyKey) {
    const before = Object.getOwnPropertyDescriptor(target, key);
    this.undos.push(() => { if (before) Object.defineProperty(target, key, before); else Reflect.deleteProperty(target, key); });
  }
  map<K, V>(target: Map<K, V>, key: K) {
    const existed = target.has(key), before = target.get(key);
    this.undos.push(() => { if (existed) target.set(key, before!); else target.delete(key); });
  }
  rollback() {
    for (let i = this.undos.length - 1; i >= 0; i--) this.undos[i]();
    this.undos.length = 0;
  }
}
