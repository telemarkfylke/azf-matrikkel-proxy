import { logger } from "@vestfoldfylke/loglady";
import type { Logger } from "../../ports.ts";

// loglady reads its destinations from environment variables when the module loads
// (CONSOLE_*, BETTERSTACK_*, TEAMS_WEBHOOK_URL, TEAMS_MIN_LOG_LEVEL, APP_NAME).
// Templates are only known at runtime, so loglady can't check the parameter count at compile time.
type Params = never[];

export const loglady: Logger = {
  info: (template, ...params) => logger.info(template, ...(params as Params)),
  warn: (template, ...params) => logger.warn(template, ...(params as Params)),
  error: (template, ...params) => logger.error(template, ...(params as Params)),
  errorException: (error, template, ...params) => logger.errorException(error as Error, template, ...(params as Params))
};
