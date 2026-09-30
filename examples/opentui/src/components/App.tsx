import { useEffect, useRef, useState } from "react";

import { useChat, useController } from "../hooks/use-marmot.js";
import { useAppKeybindings } from "../hooks/use-app-keybindings.js";
import { NavigationProvider, useNavigation } from "../hooks/use-navigation.js";
import { ChatView } from "./ChatView.js";
import { Header } from "./Header.js";
import { KeybindingFooter } from "./KeybindingFooter.js";
import { ModalHost, type Modal } from "./ModalHost.js";
import { ProfilePanel } from "./ProfilePanel.js";
import { Sidebar } from "./Sidebar.js";
import { globalHints, panelHints } from "./hints.js";

export function App(props: { onQuit: () => void }) {
  return (
    <NavigationProvider>
      <AppContent onQuit={props.onQuit} />
    </NavigationProvider>
  );
}

function AppContent(props: { onQuit: () => void }) {
  const controller = useController();
  const { relaySetupRequest } = useChat();
  const nav = useNavigation();
  const started = useRef(false);
  const [modal, setModal] = useState<Modal>(null);

  useEffect(() => {
    if (started.current) return;
    started.current = true;
    controller.start().catch((err) => controller.logError(err));
  }, [controller]);

  // Handshake with MarmotController#relaySetupRequest: the controller
  // increments this counter whenever it needs the user to set up relay lists
  // (R3). We track the last value we've acted on in a ref; when the counter
  // moves past it and no other modal is open, open the relay editor in setup
  // mode. If another modal is open, the request stays pending (the ref isn't
  // advanced) until that modal closes, so an in-progress form is never
  // clobbered.
  const handledRelaySetupRequest = useRef(0);
  useEffect(() => {
    if (
      relaySetupRequest > handledRelaySetupRequest.current &&
      modal === null
    ) {
      handledRelaySetupRequest.current = relaySetupRequest;
      setModal({ kind: "relays", setup: true });
    }
  }, [relaySetupRequest, modal]);

  useAppKeybindings({ modal, setModal, onQuit: props.onQuit });

  const hints = panelHints({
    composing: nav.composing,
    replySelecting: nav.replySelecting,
    reactSelecting: nav.reactSelecting,
    saveSelecting: nav.saveSelecting,
    showAllInvites: nav.showAllInvites,
    selectedGroupIsAdmin: nav.selectedGroupIsAdmin,
    activeGroupIsAdmin: nav.activeGroupIsAdmin,
  });

  return (
    <box
      flexDirection="column"
      width="100%"
      height="100%"
      backgroundColor="#0e0e16"
    >
      <Header onShowQr={() => setModal({ kind: "myqr" })} />

      <box flexGrow={1} flexDirection="row">
        <Sidebar />
        <ChatView />
        <ProfilePanel />
      </box>

      <KeybindingFooter
        title={nav.focus}
        hints={[
          ...hints[nav.focus],
          ...globalHints({ canUploadAudit: controller.canUploadAudit }),
        ]}
      />

      <ModalHost modal={modal} setModal={setModal} />
    </box>
  );
}
