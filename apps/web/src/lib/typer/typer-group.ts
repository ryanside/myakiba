import { Typer } from "@/lib/typer/typer";
import type { TyperOptions } from "@/lib/typer/typer";

export class TyperGroup {
  private typers: Typer[] = [];

  constructor(elements: HTMLElement[], opts: Omit<TyperOptions, "delay"> = {}, stagger = 0.15) {
    this.typers = elements.map((el, i) => new Typer(el, { ...opts, delay: i * stagger }));
  }

  in() {
    this.typers.forEach((t) => t.in());
  }

  out() {
    this.typers.forEach((t) => t.out());
  }

  destroy() {
    this.typers.forEach((t) => t.destroy());
  }
}
