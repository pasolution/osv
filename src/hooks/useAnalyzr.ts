/**
 * Hook for sending custom events to Analyzr analytics
 */

const API_KEY = "rpiezq5gen3csm7ruwi2e";
const ANALYZR_API_URL = "https://getanalyzr.vercel.app/api/events";
const DOMAIN = typeof window !== "undefined" ? window.location.hostname : "localhost";

interface AnalyzrField {
  name: string;
  value: string;
  inline?: boolean;
}

interface AnalyzrEventPayload {
  name: string;
  domain: string;
  description: string;
  emoji?: string;
  fields?: AnalyzrField[];
}

/**
 * Send a custom event to Analyzr
 */
export const sendAnalyzrEvent = async (
  eventName: string,
  description: string,
  fields?: Record<string, string>,
  emoji?: string
): Promise<void> => {
  try {
    const eventPayload: AnalyzrEventPayload = {
      name: eventName,
      domain: DOMAIN,
      description: description,
      emoji: emoji || "📊",
      fields: fields
        ? Object.entries(fields).map(([name, value]) => ({
            name,
            value: String(value),
            inline: true,
          }))
        : undefined,
    };

    const response = await fetch(ANALYZR_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(eventPayload),
    });

    if (!response.ok) {
      console.error("Analyzr event failed:", response.statusText);
    }
  } catch (error) {
    // Silently fail - don't let analytics errors break the app
    console.debug("Analyzr error (non-critical):", error);
  }
};

/**
 * Hook for using Analyzr in React components
 */
export const useAnalyzr = () => {
  return {
    trackSchemaSelected: (schemaName: string, schemaPath: string) => {
      sendAnalyzrEvent(
        "schema_selected",
        `User selected schema: ${schemaName}`,
        {
          "Schema Name": schemaName,
          "Schema Path": schemaPath,
          Timestamp: new Date().toISOString(),
        },
        "📋"
      );
    },

    trackViewModeSwitched: (
      schemaName: string,
      newMode: string,
      previousMode: string
    ) => {
      sendAnalyzrEvent(
        "view_mode_switched",
        `User switched from ${previousMode} to ${newMode}`,
        {
          Schema: schemaName,
          "New Mode": newMode,
          "Previous Mode": previousMode,
        },
        "🔄"
      );
    },

    trackSchemaSearch: (query: string) => {
      sendAnalyzrEvent(
        "schema_search",
        `User searched for: ${query}`,
        {
          "Search Query": query,
          "Query Length": String(query.length),
        },
        "🔍"
      );
    },

    trackNodeExpanded: (nodeName: string, nodeType: string) => {
      sendAnalyzrEvent(
        "node_expanded",
        `User expanded ${nodeType}: ${nodeName}`,
        {
          "Node Name": nodeName,
          "Node Type": nodeType,
        },
        "📂"
      );
    },
  };
};
