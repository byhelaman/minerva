import { Component, ErrorInfo, ReactNode } from "react";
import { AlertTriangle, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from "@/components/ui/card";
import { logger } from "@/lib/logger";

interface Props {
    children: ReactNode;
    /** Optional fallback UI. If not provided, a default error card is shown. */
    fallback?: ReactNode;
}

interface State {
    hasError: boolean;
    error: Error | null;
}

/**
 * React Error Boundary — catches rendering errors in the component tree.
 * Prevents the entire app from crashing due to an unhandled exception in a child.
 */
export class ErrorBoundary extends Component<Props, State> {
    constructor(props: Props) {
        super(props);
        this.state = { hasError: false, error: null };
    }

    static getDerivedStateFromError(error: Error): State {
        return { hasError: true, error };
    }

    componentDidCatch(error: Error, errorInfo: ErrorInfo) {
        logger.error("[ErrorBoundary] Uncaught error:", error, errorInfo.componentStack);
    }

    handleReset = () => {
        this.setState({ hasError: false, error: null });
    };

    handleReload = () => {
        window.location.reload();
    };

    render() {
        if (this.state.hasError) {
            if (this.props.fallback) {
                return this.props.fallback;
            }

            return (
                <div className="flex items-center justify-center min-h-[400px] p-6">
                    <Card className="w-full max-w-lg">
                        <CardHeader className="text-center">
                            <div className="mx-auto mb-2 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
                                <AlertTriangle className="h-6 w-6 text-destructive" />
                            </div>
                            <CardTitle>Something went wrong</CardTitle>
                        </CardHeader>
                        <CardContent>
                            <p className="text-sm text-muted-foreground text-center">
                                An unexpected error occurred. You can try again or reload the page.
                            </p>
                            {this.state.error && (
                                <pre className="mt-4 max-h-32 overflow-auto rounded-md bg-muted p-3 text-xs text-muted-foreground">
                                    {this.state.error.message}
                                </pre>
                            )}
                        </CardContent>
                        <CardFooter className="flex justify-center gap-3">
                            <Button variant="outline" onClick={this.handleReset}>
                                <RefreshCw className="mr-2 h-4 w-4" />
                                Try Again
                            </Button>
                            <Button onClick={this.handleReload}>
                                Reload Page
                            </Button>
                        </CardFooter>
                    </Card>
                </div>
            );
        }

        return this.props.children;
    }
}
