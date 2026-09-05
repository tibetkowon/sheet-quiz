import { Component, ReactNode } from "react";

interface Props {
  children: ReactNode;
}

interface State {
  hasError: boolean;
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: unknown): void {
    console.error("Unhandled error in 풀이장:", error);
  }

  private reset = (): void => {
    this.setState({ hasError: false });
    window.location.assign("/");
  };

  render(): ReactNode {
    if (this.state.hasError) {
      return (
        <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-10 text-center">
          <h1 className="font-display text-xl font-semibold">문제가 발생했어요</h1>
          <p className="max-w-sm text-sm text-text-secondary dark:text-text-dark-secondary">
            예기치 못한 오류로 화면을 표시할 수 없습니다. 시작 화면으로 돌아가 다시
            시도해주세요.
          </p>
          <button
            type="button"
            onClick={this.reset}
            className="rounded bg-accent px-4.5 py-2.5 text-sm font-semibold text-white dark:bg-accent-dark"
          >
            시작 화면으로 돌아가기
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
