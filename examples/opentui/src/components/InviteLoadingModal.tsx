import { useKeyboard } from "@opentui/react";
import { useEffect, useState } from "react";

import { useController } from "../hooks/use-marmot.js";
import type { InviteCandidates } from "../marmot/controller.js";
import { ModalOverlay, theme } from "./primitives.js";

const SPINNER_FRAMES = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
const SPINNER_INTERVAL_MS = 80;

/**
 * Shown while the controller looks up an invitee: NIP-05 resolution, their
 * outbox/inbox relay lists, then their KeyPackages. Runs the lookup itself and
 * displays the current step next to a spinner. Esc cancels — the lookup keeps
 * running in the background but its result is ignored.
 */
export function InviteLoadingModal(props: {
  target: string;
  onDone: (data: InviteCandidates | null) => void;
  onCancel: () => void;
}) {
  const controller = useController();
  const [step, setStep] = useState("starting lookup…");
  const [frame, setFrame] = useState(0);

  useEffect(() => {
    let cancelled = false;
    void controller
      .loadInviteCandidates(props.target, (next) => {
        if (!cancelled) setStep(next);
      })
      .then((data) => {
        if (!cancelled) props.onDone(data);
      });
    return () => {
      cancelled = true;
    };
    // Run the lookup once per target; onDone is a fresh closure each render.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [controller, props.target]);

  useEffect(() => {
    const timer = setInterval(
      () => setFrame((f) => (f + 1) % SPINNER_FRAMES.length),
      SPINNER_INTERVAL_MS,
    );
    return () => clearInterval(timer);
  }, []);

  useKeyboard((key) => {
    if (key.name === "escape") props.onCancel();
  });

  return (
    <ModalOverlay
      title={`invite ${props.target}`}
      width={60}
      footer="esc: cancel"
    >
      <text>
        <span fg={theme.accent}>{SPINNER_FRAMES[frame]} </span>
        <span fg={theme.value}>{step}</span>
      </text>
    </ModalOverlay>
  );
}
