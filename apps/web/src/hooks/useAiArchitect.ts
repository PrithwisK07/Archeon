import { useState, useCallback } from 'react';
import { useReactFlow } from 'reactflow';
import { useArchitectureStore } from '../store/architectureStore';
import { ContextOrchestrator } from '../lib/contextOrchestrator';
import { ShadowGraph } from '@zero-dollar/compiler/src/shadowGraph';

export function useAiArchitect() {
  const [isGenerating, setIsGenerating] = useState(false);
  const { fitView } = useReactFlow();
  const { present, nodes, applyAIPatch, addChatMessage } = useArchitectureStore();

  const submitPrompt = useCallback(
    async (promptText: string) => {
      if (!promptText.trim() || isGenerating) return;
      setIsGenerating(true);
      addChatMessage({ role: 'user', content: promptText });

      try {
        const selectedNode = nodes.find((n) => n.selected);
        const contextMap = ContextOrchestrator.buildAIPayload(
          present,
          promptText,
          selectedNode?.id
        );

        const response = await fetch('/api/v1/ai/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: 'Bearer development-token',
          },
          body: JSON.stringify({ prompt: promptText, contextMap, isVisionTask: false }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Gateway Error: ${response.statusText}`);

        addChatMessage({ role: 'ai', content: data.reasoning });
        const newIR = ShadowGraph.simulateAndValidate(present, data.actions);
        applyAIPatch(newIR);

        setTimeout(() => fitView({ padding: 0.2, duration: 600 }), 100);
      } catch (err: any) {
        let safeMessage =
          'I encountered an internal conflict while processing that architecture. Could you try rephrasing?';
        if (err.message.includes('Failed to generate a valid architecture')) {
          safeMessage =
            "I had trouble mapping that exact request to the strict database schema. Let's try adding those entities one at a time.";
        } else if (
          err.message.includes('fetch') ||
          err.message.includes('Network') ||
          err.message.includes('429')
        ) {
          safeMessage = 'The AI Gateway is experiencing heavy load. Please wait a moment and try again.';
        }
        addChatMessage({ role: 'warn', content: safeMessage });
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, nodes, present, applyAIPatch, addChatMessage, fitView]
  );

  return {
    isGenerating,
    submitPrompt,
  };
}