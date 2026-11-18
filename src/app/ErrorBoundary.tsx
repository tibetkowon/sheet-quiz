import { Component, ReactNode } from "react";
import { Button } from "@astryxdesign/core/Button";
import { Heading } from "@astryxdesign/core/Heading";
import { Text } from "@astryxdesign/core/Text";

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
        <div role="alert" className="flex min-h-screen flex-col items-center justify-center gap-4 px-10 text-center">
          <Heading level={1}>문제가 발생했어요</Heading>
          <div className="max-w-sm">
            <Text color="secondary">
              예기치 못한 오류로 화면을 표시할 수 없습니다. 시작 화면으로 돌아가 다시
              시도해주세요.
            </Text>
          </div>
          <Button label="시작 화면으로 돌아가기" variant="primary" onClick={this.reset} />
        </div>
      );
    }
    return this.props.children;
  }
}
