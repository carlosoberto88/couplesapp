import { enUS, esES } from "@clerk/localizations";

const PASSWORD_COPY = {
  en: {
    goodPassword:
      "Format requirements met. Your password will also be checked against known data breaches when you continue.",
    formPasswordPwned:
      "This password has been found in a data breach and cannot be used. Please choose a unique password you don't use elsewhere.",
  },
  es: {
    goodPassword:
      "Cumples los requisitos de formato. Al continuar, también verificaremos que la contraseña no aparezca en filtraciones conocidas.",
    formPasswordPwned:
      "Esta contraseña aparece en una filtración de datos y no se puede usar. Elige una contraseña única que no uses en otros sitios.",
  },
} as const;

function withPasswordOverrides(
  base: typeof enUS,
  copy: (typeof PASSWORD_COPY)[keyof typeof PASSWORD_COPY],
) {
  return {
    ...base,
    unstable__errors: {
      ...base.unstable__errors,
      form_password_pwned: copy.formPasswordPwned,
      zxcvbn: {
        ...base.unstable__errors?.zxcvbn,
        goodPassword: copy.goodPassword,
      },
    },
  };
}

export function getClerkLocalization(locale: string) {
  return locale === "es"
    ? withPasswordOverrides(esES, PASSWORD_COPY.es)
    : withPasswordOverrides(enUS, PASSWORD_COPY.en);
}
