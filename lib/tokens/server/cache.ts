import { TokenServiceError } from "../errors";
export class AsyncCache<T> {
  private values = new Map<string, { value: T; expires: number }>();
  private pending = new Map<string, Promise<T>>();
  constructor(private readonly ttlMs: number, private readonly capacity = 300, private readonly now = Date.now) {}
  peek(key: string): T | undefined { const entry=this.values.get(key); if(entry && entry.expires>this.now())return entry.value; this.values.delete(key); return undefined; }
  put(key: string, value: T) { if(this.values.size>=this.capacity)this.values.delete(this.values.keys().next().value!);this.values.set(key,{value,expires:this.now()+this.ttlMs}); }
  get(key: string, loader: () => Promise<T>): Promise<T> {
    const cached = this.values.get(key);
    if (cached && cached.expires > this.now()) return Promise.resolve(cached.value);
    this.values.delete(key);
    const pending = this.pending.get(key);
    if (pending) return pending;
    if (this.pending.size >= 32) return Promise.reject(new TokenServiceError("BUSY", "Token search is busy. Please try again shortly.", 429));
    const request = Promise.resolve().then(loader).then(value => {
      if (this.values.size >= this.capacity) this.values.delete(this.values.keys().next().value!);
      this.values.set(key, { value, expires: this.now() + this.ttlMs });
      return value;
    }).finally(() => this.pending.delete(key));
    this.pending.set(key, request);
    return request;
  }
}
