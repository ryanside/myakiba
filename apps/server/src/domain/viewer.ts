/**
 * The signed-in caller. Only the `auth` macro creates one, so a route without a
 * session cannot call `serve`, and the private field stops an object literal passing as one.
 */
export class Viewer {
  readonly #userId: string;

  private constructor(userId: string) {
    this.#userId = userId;
  }

  static fromSession(session: { readonly user: { readonly id: string } }): Viewer {
    return new Viewer(session.user.id);
  }

  get userId(): string {
    return this.#userId;
  }
}
