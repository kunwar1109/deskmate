import { useChat } from '@ai-sdk/react';
import type { CitedSource, WidgetSession, WidgetUIMessage } from '@deskmate/shared/widget';
import { DefaultChatTransport } from 'ai';
import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent } from 'react';
import {
  chatErrorMessage,
  clearSession,
  createApi,
  loadSession,
  messageText,
  saveSession,
  type WidgetApi,
  type WidgetOptions,
} from './api';

const MAX_MESSAGE_LENGTH = 2000; // same limit as the API

export function Widget(options: WidgetOptions) {
  const [api] = useState(() => createApi(options));
  const [open, setOpen] = useState(false);
  // The panel mounts on first open and then stays mounted (just hidden), so closing it mid-reply keeps the chat.
  const [opened, setOpened] = useState(false);
  const launcherRef = useRef<HTMLButtonElement>(null);

  function toggle() {
    setOpen((value) => !value);
    setOpened(true);
  }

  function close() {
    setOpen(false);
    launcherRef.current?.focus(); // keyboard users land back where they started
  }

  return (
    <>
      {opened && (
        <div id="deskmate-panel" className="panel" hidden={!open}>
          <Panel api={api} widgetKey={options.widgetKey} open={open} onClose={close} />
        </div>
      )}
      <button
        ref={launcherRef}
        type="button"
        className="launcher"
        onClick={toggle}
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        aria-controls="deskmate-panel"
      >
        {open ? <CloseIcon /> : <ChatIcon />}
      </button>
    </>
  );
}

type PanelState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; workspaceName: string; session: WidgetSession | null; messages: WidgetUIMessage[] };

interface PanelProps {
  api: WidgetApi;
  widgetKey: string;
  open: boolean;
  onClose: () => void;
}

/** Loads the workspace name and any saved chat, then shows the chat. Runs on first open, not on page load. */
function Panel({ api, widgetKey, open, onClose }: PanelProps) {
  const [state, setState] = useState<PanelState>({ status: 'loading' });
  const [chatKey, setChatKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const saved = loadSession(widgetKey);
    Promise.all([api.getConfig(), saved ? api.loadConversation(saved) : null])
      .then(([config, conversation]) => {
        if (saved && !conversation) clearSession(widgetKey); // the chat is gone (e.g. the key was rotated)
        if (cancelled) return;
        setState({
          status: 'ready',
          workspaceName: config.workspaceName,
          session: conversation ? saved : null,
          messages: conversation?.messages ?? [],
        });
      })
      .catch((err: Error) => {
        if (!cancelled) setState({ status: 'error', message: err.message });
      });
    return () => {
      cancelled = true;
    };
  }, [api, widgetKey]);

  function startOver() {
    clearSession(widgetKey);
    if (state.status === 'ready') setState({ ...state, session: null, messages: [] });
    setChatKey((key) => key + 1); // a fresh useChat with no messages
  }

  const title = state.status === 'ready' ? state.workspaceName : 'Support';
  return (
    <div
      className="panel-inner"
      role="dialog"
      aria-label={`${title} support chat`}
      onKeyDown={(event) => {
        if (event.key === 'Escape') onClose();
      }}
    >
      <header className="header">
        <div>
          <p className="title">{title}</p>
          <p className="subtitle">Answers from our help center</p>
        </div>
        {state.status === 'ready' && (
          <button type="button" className="icon-button" onClick={startOver} aria-label="Start a new chat" title="New chat">
            <RefreshIcon />
          </button>
        )}
        <button type="button" className="icon-button" onClick={onClose} aria-label="Close chat">
          <CloseIcon />
        </button>
      </header>
      {state.status === 'loading' && <p className="status">Loading…</p>}
      {state.status === 'error' && (
        <p className="status error" role="alert">
          Chat is unavailable right now. {state.message}
        </p>
      )}
      {state.status === 'ready' && (
        <ChatView
          key={chatKey}
          api={api}
          widgetKey={widgetKey}
          workspaceName={state.workspaceName}
          session={state.session}
          initialMessages={state.messages}
          open={open}
        />
      )}
    </div>
  );
}

interface ChatViewProps {
  api: WidgetApi;
  widgetKey: string;
  workspaceName: string;
  session: WidgetSession | null;
  initialMessages: WidgetUIMessage[];
  open: boolean;
}

function ChatView({ api, widgetKey, workspaceName, session, initialMessages, open }: ChatViewProps) {
  const [input, setInput] = useState('');
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const logRef = useRef<HTMLDivElement>(null);

  const [transport] = useState(() => {
    let current = session; // set by the first send when this is a new chat
    return new DefaultChatTransport<WidgetUIMessage>({
      credentials: 'omit',
      async prepareSendMessagesRequest({ messages }) {
        // The chat is created on the first message, so visitors who only open the widget create nothing.
        if (!current) {
          current = await api.createConversation();
          saveSession(widgetKey, current);
        }
        const last = messages.at(-1);
        return {
          api: api.messagesUrl(current.conversationId),
          headers: { Authorization: `Bearer ${current.visitorToken}` },
          body: { text: last ? messageText(last) : '' }, // only the new text: the server keeps the history
        };
      },
    });
  });

  const { messages, sendMessage, status, error } = useChat<WidgetUIMessage>({
    messages: initialMessages,
    transport,
    throttle: 50,
  });
  const busy = status === 'submitted' || status === 'streaming';
  const last = messages.at(-1);
  const waiting = busy && (last?.role === 'user' || (last !== undefined && !messageText(last)));

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, status]);

  function submit(event?: FormEvent) {
    event?.preventDefault();
    const text = input.trim();
    if (!text || busy) return;
    setInput('');
    resize(inputRef.current, true);
    void sendMessage({ text });
  }

  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  }

  return (
    <>
      {/* role="log" announces new messages to screen readers; aria-busy holds them until a reply has finished. */}
      <div ref={logRef} className="log" role="log" aria-live="polite" aria-busy={busy}>
        <div className="message assistant">
          <p>Hi! I&apos;m the {workspaceName} assistant. Ask me anything about our products, orders or policies.</p>
        </div>
        {messages.map((message) =>
          message.role === 'user' ? (
            <div key={message.id} className="message user">
              <p>{messageText(message)}</p>
            </div>
          ) : messageText(message) ? (
            <AssistantMessage key={message.id} message={message} />
          ) : null,
        )}
        {waiting && (
          <div className="message assistant typing" aria-label="The assistant is typing">
            <span />
            <span />
            <span />
          </div>
        )}
        {error && (
          <p className="status error" role="alert">
            {chatErrorMessage(error)}
          </p>
        )}
      </div>
      <form className="composer" onSubmit={submit}>
        <textarea
          ref={inputRef}
          value={input}
          rows={1}
          maxLength={MAX_MESSAGE_LENGTH}
          placeholder="Type your question…"
          aria-label="Your message"
          onChange={(event) => {
            setInput(event.target.value);
            resize(event.target);
          }}
          onKeyDown={onKeyDown}
        />
        <button type="submit" className="send" disabled={busy || !input.trim()} aria-label="Send">
          <SendIcon />
        </button>
      </form>
      <p className="footer">Powered by Deskmate</p>
    </>
  );
}

/** Grows the textarea with its content, up to the CSS max-height. */
function resize(textarea: HTMLTextAreaElement | null, reset = false) {
  if (!textarea) return;
  textarea.style.height = 'auto';
  if (!reset) textarea.style.height = `${textarea.scrollHeight}px`;
}

function AssistantMessage({ message }: { message: WidgetUIMessage }) {
  const text = messageText(message);
  const sources = new Map<number, CitedSource>();
  for (const part of message.parts) {
    if (part.type === 'data-sources') for (const source of part.data) sources.set(source.n, source);
  }
  // Only sources the answer actually cites: a handoff or a "please share your email" cites nothing.
  const cited = [...new Set([...text.matchAll(/\[(\d+)\]/g)].map((m) => Number(m[1])))]
    .filter((n) => sources.has(n))
    .sort((a, b) => a - b);

  return (
    <div className="message assistant">
      <p>
        {text.split(/(\[\d+\])/).map((segment, i) => {
          const n = Number(/^\[(\d+)\]$/.exec(segment)?.[1]);
          return sources.has(n) ? (
            <sup key={i} className="cite">
              {n}
            </sup>
          ) : (
            segment
          );
        })}
      </p>
      {cited.length > 0 && (
        <ul className="sources" aria-label="Sources">
          {cited.map((n) => {
            const source = sources.get(n)!;
            return (
              <li key={n}>
                <span className="cite">{n}</span> {source.title}
                {source.page !== undefined && `, page ${source.page}`}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

// Inline icons: no icon library, to keep the script small.
function ChatIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 5h16v11H8l-4 4V5z" />
    </svg>
  );
}

function CloseIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M4 12l16-8-6 16-2-6-8-2z" />
    </svg>
  );
}

function RefreshIcon() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M20 12a8 8 0 1 1-2.3-5.7M20 4v5h-5" />
    </svg>
  );
}
