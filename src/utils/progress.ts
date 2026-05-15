
import ora from "ora";
import type { Ora } from "ora";
export async function withSpinner<T>(text: string, task: (spinner: Ora) => Promise<T>) {
  const spinner = ora({
    text,
    discardStdin: false,
  }).start();

  try {
    return await task(spinner);
  } catch (error) {
    spinner.fail(`请求模型失败`);
    throw error;
  } finally {
    if (spinner.isSpinning) {
      spinner.stop();
    }
  }
}

