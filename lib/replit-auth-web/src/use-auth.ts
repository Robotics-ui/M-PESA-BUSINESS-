import { useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  useGetCurrentAuthUser,
  useSignUp,
  useLogIn,
  useLogoutBrowserSession,
  useChangeMyPassword,
  getGetCurrentAuthUserQueryKey,
} from "@workspace/api-client-react";
import type { AuthUser } from "@workspace/api-client-react";

export type { AuthUser };

interface AuthState {
  user: AuthUser | null;
  isLoading: boolean;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<AuthUser | null>;
  signup: (input: { email: string; password: string; firstName: string; lastName: string }) => Promise<AuthUser | null>;
  changePassword: (currentPassword: string, newPassword: string) => Promise<AuthUser | null>;
  logout: () => Promise<void>;
  isLoginPending: boolean;
  isSignupPending: boolean;
  loginError: string | null;
  signupError: string | null;
}

function extractErrorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object") {
    const maybeError = error as { error?: unknown; message?: unknown };
    if (typeof maybeError.error === "string") return maybeError.error;
    if (typeof maybeError.message === "string") return maybeError.message;
  }
  return fallback;
}

export function useAuth(): AuthState {
  const queryClient = useQueryClient();
  const { data, isLoading } = useGetCurrentAuthUser();
  const signUpMutation = useSignUp();
  const logInMutation = useLogIn();
  const logoutMutation = useLogoutBrowserSession();
  const changePasswordMutation = useChangeMyPassword();

  const user = data?.user ?? null;

  const login = useCallback(
    async (email: string, password: string) => {
      const result = await logInMutation.mutateAsync({ data: { email, password } });
      await queryClient.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
      return result.user;
    },
    [logInMutation, queryClient],
  );

  const signup = useCallback(
    async (input: { email: string; password: string; firstName: string; lastName: string }) => {
      const result = await signUpMutation.mutateAsync({ data: input });
      await queryClient.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
      return result.user;
    },
    [signUpMutation, queryClient],
  );

  const changePassword = useCallback(
    async (currentPassword: string, newPassword: string) => {
      const result = await changePasswordMutation.mutateAsync({ data: { currentPassword, newPassword } });
      await queryClient.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
      return result.user;
    },
    [changePasswordMutation, queryClient],
  );

  const logout = useCallback(async () => {
    await logoutMutation.mutateAsync();
    await queryClient.invalidateQueries({ queryKey: getGetCurrentAuthUserQueryKey() });
  }, [logoutMutation, queryClient]);

  return {
    user,
    isLoading,
    isAuthenticated: !!user,
    login,
    signup,
    changePassword,
    logout,
    isLoginPending: logInMutation.isPending,
    isSignupPending: signUpMutation.isPending,
    loginError: logInMutation.error ? extractErrorMessage(logInMutation.error, "Invalid email or password") : null,
    signupError: signUpMutation.error ? extractErrorMessage(signUpMutation.error, "Could not create account") : null,
  };
}
