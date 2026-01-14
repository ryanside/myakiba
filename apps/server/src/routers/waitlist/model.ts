import { z } from "zod";

export const joinWaitlistSchema = z.object({
  email: z.email("Invalid email address"),
  turnstileToken: z.string().min(1, "Captcha verification required"),
});

export type JoinWaitlistInput = z.infer<typeof joinWaitlistSchema>;

export const verifyAccessSchema = z.object({
  password: z.string().min(1, "Password is required"),
});

export type VerifyAccessInput = z.infer<typeof verifyAccessSchema>;
