import { CopilotDrawer } from './CopilotDrawer';
import { FieldInspectorDrawer } from './FieldInspectorDrawer';

interface ChatConsoleProps {
  onSumbit: (prompt: string) => Promise<void>;
  isThinking: boolean;
}

export function ChatConsole({ onSumbit, isThinking }: ChatConsoleProps) {
  return (
    <>
      <CopilotDrawer onSubmit={onSumbit} isThinking={isThinking} />
      <FieldInspectorDrawer />
    </>
  );
}