const runtimeProfiles = {
  development: {
    required: ["JWT_KEY", "DATABASE_URL", "ORIGIN", "CLERK_SECRET_KEY"],
    enforceHttpsOrigins: false,
  },
  staging: {
    required: ["JWT_KEY", "DATABASE_URL", "ORIGIN", "CLERK_SECRET_KEY"],
    enforceHttpsOrigins: true,
  },
  production: {
    required: ["JWT_KEY", "DATABASE_URL", "ORIGIN", "CLERK_SECRET_KEY"],
    enforceHttpsOrigins: true,
  },
};

const optionalProductionWarnings = [
  "CAPTCHA_SECRET_KEY",
  "SECURITY_ALERT_EMAIL",
  "RAZORPAY_WEBHOOK_SECRET",
  "SUPABASE_SERVICE_ROLE_KEY",
];

const parseList = (value = "") =>
  String(value)
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

export const getRuntimeEnvironment = () => process.env.APP_ENV || process.env.NODE_ENV || "development";
export const isProductionLikeEnvironment = () =>
  ["staging", "production"].includes(getRuntimeEnvironment());

export const getJwtSigningKey = () => process.env.JWT_KEY || "";

export const getJwtVerificationKeys = () => {
  const keys = [process.env.JWT_KEY, ...parseList(process.env.JWT_KEY_PREVIOUS)];
  return [...new Set(keys.filter(Boolean))];
};

export const validateEnv = () => {
  const runtimeEnvironment = getRuntimeEnvironment();
  const profile = runtimeProfiles[runtimeEnvironment] || runtimeProfiles.development;
  const requiredKeys = profile.required;
  const missingKeys = requiredKeys.filter((key) => !process.env[key]);
  const placeholderSecrets = [
    "replace-with-",
    "changeme",
    "example",
    "placeholder",
  ];

  if (missingKeys.length) {
    throw new Error(`Missing required environment variables: ${missingKeys.join(", ")}`);
  }

  const hasPlaceholder = (value = "") =>
    placeholderSecrets.some((marker) => String(value).toLowerCase().includes(marker));

  if (!getJwtVerificationKeys().length) {
    throw new Error("At least one JWT signing key must be configured.");
  }

  if (
    String(process.env.JWT_KEY_PREVIOUS || "").trim() &&
    !String(process.env.JWT_KEY_ID || "").trim()
  ) {
    throw new Error("JWT_KEY_ID is required when JWT key rotation is configured.");
  }

  if (profile.enforceHttpsOrigins) {
    const invalidOrigins = parseList(process.env.ORIGIN).filter(
      (origin) => !String(origin).startsWith("https://")
    );
    if (invalidOrigins.length) {
      throw new Error(`${runtimeEnvironment} ORIGIN values must use HTTPS.`);
    }
  }

  if (process.env.CAPTCHA_ENFORCE_AUTH === "true" && !process.env.CAPTCHA_SECRET_KEY) {
    throw new Error("CAPTCHA_SECRET_KEY is required when CAPTCHA_ENFORCE_AUTH=true.");
  }

  if (isProductionLikeEnvironment()) {
    if (String(process.env.JWT_KEY || "").length < 32) {
      throw new Error("JWT_KEY must be at least 32 characters for session signing.");
    }

    optionalProductionWarnings
      .filter((key) => !process.env[key])
      .forEach((key) => {
        console.warn(`${runtimeEnvironment} security warning: ${key} is not configured.`);
      });

    const placeholderKeys = [
      "CLERK_SECRET_KEY",
      "JWT_KEY",
      "EMAIL_PASSWORD",
      "OPENAI_API_KEY",
      "RAZORPAY_KEY_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
    ].filter((key) => hasPlaceholder(process.env[key] || ""));

    if (placeholderKeys.length) {
      throw new Error(
        `Unsafe placeholder secrets detected for ${runtimeEnvironment}: ${placeholderKeys.join(", ")}`
      );
    }
  }

  if (!isProductionLikeEnvironment()) {
    if (String(process.env.JWT_KEY || "").length < 32) {
      console.warn("Development security warning: JWT_KEY should be at least 32 characters.");
    }

    [
      "CLERK_SECRET_KEY",
      "JWT_KEY",
      "EMAIL_PASSWORD",
      "OPENAI_API_KEY",
      "RAZORPAY_KEY_SECRET",
      "SUPABASE_SERVICE_ROLE_KEY",
    ]
      .filter((key) => hasPlaceholder(process.env[key] || ""))
      .forEach((key) => {
        console.warn(`Development security warning: ${key} still uses a placeholder value.`);
      });
  }

  return {
    runtimeEnvironment,
    profile,
    allowedOrigins: parseList(process.env.ORIGIN),
    jwtRotationEnabled: getJwtVerificationKeys().length > 1,
    securityLogRetentionDays: Math.max(Number(process.env.SECURITY_LOG_RETENTION_DAYS) || 180, 30),
  };
};
