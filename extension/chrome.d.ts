type ChromeMessageSender = {
  tab?: {
    id?: number;
    url?: string;
  };
};

type ChromeMessageSendResponse = (response?: unknown) => void;

type ChromeExtensionMessage = Record<string, unknown> & {
  type?: string;
  mode?: "standard" | "admin";
  tabId?: number;
  data?: unknown;
  error?: unknown;
  pacing?: unknown;
  state?: unknown;
  // GEN-74: consent assertion carried on START_EXTRACTION messages.
  consentAcknowledged?: boolean;
};

type ChromeEvent<TListener> = {
  addListener(listener: TListener): void;
};

declare const chrome: {
  action: {
    setIcon(details: {
      tabId?: number;
      path: string | Record<string, string>;
    }): Promise<void>;
    setTitle(details: {
      tabId?: number;
      title: string;
    }): Promise<void>;
  };
  runtime: {
    onMessage: ChromeEvent<
      (
        message: ChromeExtensionMessage,
        sender: ChromeMessageSender,
        sendResponse: ChromeMessageSendResponse,
      ) => boolean | void
    >;
    sendMessage(message: ChromeExtensionMessage): Promise<unknown>;
  };
  storage: {
    local: {
      get(keys?: string | string[] | Record<string, unknown> | null): Promise<Record<string, unknown>>;
      set(items: Record<string, unknown>): Promise<void>;
    };
  };
  tabs: {
    onUpdated: ChromeEvent<
      (
        tabId: number,
        changeInfo: { status?: string },
        tab: { id?: number; url?: string },
      ) => void
    >;
    query(queryInfo: Record<string, unknown>): Promise<Array<{ id?: number; url?: string }>>;
    get(tabId: number): Promise<{ id?: number; url?: string }>;
    sendMessage(tabId: number, message: ChromeExtensionMessage): Promise<unknown>;
  };
};
