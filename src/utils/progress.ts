
import ora from "ora";

export async function withSpinner<T>(text: string, task: () => Promise<T>) {
  const spinner = ora({
    text,
    discardStdin: false,
  }).start();

  try {
    return await task();
  } catch (error) {
    spinner.fail(`${text}失败`);
    throw error;
  } finally {
    if (spinner.isSpinning) {
      spinner.stop();
    }
  }
}

