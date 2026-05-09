import cliProgress from "cli-progress";
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

export async function withProgressBar<T>(
  label: string,
  total: number,
  task: (tick: () => void) => Promise<T>,
) {
  if (total <= 0) {
    return task(() => undefined);
  }

  const bar = new cliProgress.SingleBar(
    {
      clearOnComplete: true,
      format: `${label} |{bar}| {value}/{total} {percentage}%`,
      hideCursor: true,
      stopOnComplete: true,
    },
    cliProgress.Presets.shades_classic,
  );

  bar.start(total, 0);
  try {
    return await task(() => bar.increment());
  } finally {
    bar.stop();
  }
}
