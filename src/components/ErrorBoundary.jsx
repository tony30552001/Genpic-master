import React from "react";

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true, error };
  }

  handleReset = () => {
    this.setState({ hasError: false, error: null });
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-background text-foreground flex items-center justify-center p-6">
          <div className="max-w-md w-full rounded-xl border border-border bg-card p-6 shadow-lg">
            <h1 className="text-xl font-semibold mb-2">發生錯誤</h1>
            <p className="text-sm text-muted-foreground mb-4">
              內容無法載入，請重試或重新整理頁面。
            </p>
            <div className="flex gap-3">
              <button
                onClick={this.handleReset}
                className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
              >
                重試
              </button>
              <button
                onClick={() => window.location.reload()}
                className="px-4 py-2 rounded-md border border-border text-sm font-medium"
              >
                重新整理
              </button>
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
