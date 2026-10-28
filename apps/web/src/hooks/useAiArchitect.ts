import { useState, useCallback, useMemo } from 'react';
import { useReactFlow } from 'reactflow';
import { createClient } from '@supabase/supabase-js';
import { useArchitectureStore } from '../store/architectureStore';
import { ContextOrchestrator } from '../lib/contextOrchestrator';
import { ShadowGraph } from '@zero-dollar/compiler/src/shadowGraph';

export function useAiArchitect() {
  const [isGenerating, setIsGenerating] = useState(false);
  const { fitView } = useReactFlow();
  
  const { nodes, applyAIPatch, addChatMessage } = useArchitectureStore();
  
  const supabase = useMemo(() => createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY! 
  ), []);

  const submitPrompt = useCallback(
    async (promptText: string) => {
      if (!promptText.trim() || isGenerating) return;
      setIsGenerating(true);
      addChatMessage({ role: 'user', content: promptText });

      try {
        const state = useArchitectureStore.getState();
        const currentPresent = state.present;
        const selectedNode = nodes.find((n) => n.selected);
        
        const contextMap = ContextOrchestrator.buildAIPayload(
          currentPresent,
          promptText,
          selectedNode?.id
        );

        // Extract history and format errors as system context for the LLM
        const recentHistory = state.chatHistory.slice(-12).map((msg) => ({
          role: msg.role === 'ai' ? 'assistant' : 'user',
          content: msg.role === 'warn' 
            ? `[SYSTEM ERROR FROM PREVIOUS ACTION]: ${msg.content}` 
            : msg.content
        }));

        const { data: { session }} = await supabase.auth.getSession();
        const token = session?.access_token;

        const response = await fetch('/api/v1/ai/generate', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ 
            prompt: promptText, 
            contextMap, 
            history: recentHistory, // Inject conversational memory
            isVisionTask: false 
          }),
        });

        const data = await response.json();
        if (!response.ok) throw new Error(data.error || `Gateway Error: ${response.statusText}`);

        addChatMessage({ role: 'ai', content: data.reasoning });
        
        const latestPresent = useArchitectureStore.getState().present;
        
        const newIR = ShadowGraph.simulateAndValidate(latestPresent, data.actions);
        applyAIPatch(newIR);

        setTimeout(() => fitView({ padding: 0.2, duration: 600 }), 100);
      } catch (err: any) {
        const errorMessage = err.message || 'Unknown internal conflict';
        
        // Log the EXACT hard check error to the chat so the AI can read it next time
        addChatMessage({ 
          role: 'warn', 
          content: `Action rejected by constraints: ${errorMessage}` 
        });
      } finally {
        setIsGenerating(false);
      }
    },
    [isGenerating, nodes, applyAIPatch, addChatMessage, fitView, supabase]
  );

  return {
    isGenerating,
    submitPrompt,
  };
}