import { z } from "zod";

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const createUserSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  role: z.enum(["ADMIN", "GENERAL"]).default("GENERAL"),
});
export type CreateUserInput = z.infer<typeof createUserSchema>;

export const bootstrapAdminSchema = z.object({
  name: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
});
export type BootstrapAdminInput = z.infer<typeof bootstrapAdminSchema>;

export const updateProfileSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  currentPassword: z.string().min(8).optional(),
  newPassword: z.string().min(8).optional(),
});
export type UpdateProfileInput = z.infer<typeof updateProfileSchema>;
