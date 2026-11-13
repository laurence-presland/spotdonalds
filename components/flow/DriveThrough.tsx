"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnalysingScreen } from "@/components/analysing/AnalysingScreen";
import { QuietLogout } from "@/components/flow/QuietLogout";
import { Welcome } from "@/components/flow/Welcome";

export function DriveThrough({ welcome }: { welcome: boolean }) {
  const router = useRouter();
  const [overlay, setOverlay] = useState(welcome);
  const [finished, setFinished] = useState(false);

  function reveal() {
    setOverlay(false);
    if (finished) {
      router.replace("/app");
      router.refresh();
    }
  }

  return (
    <>
      <AnalysingScreen
        onAdvance={() => {
          setFinished(true);
          if (!overlay) {
            router.replace("/app");
            router.refresh();
          }
        }}
      />
      {overlay ? <Welcome onDone={reveal} /> : null}
      <QuietLogout />
    </>
  );
}
