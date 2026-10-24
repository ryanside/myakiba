import { tagged } from "./tagged";

export class InvalidUserPreference extends tagged("InvalidUserPreference")<{
  preference: "currency" | "dateFormat";
  message: string;
}> {
  constructor(preference: "currency" | "dateFormat") {
    super({
      preference,
      message:
        preference === "currency"
          ? "Choose a supported currency."
          : "Choose a supported date format.",
    });
  }
}
