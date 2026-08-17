import React from "react";
import positions from "../assets/graphics/svg/all/positions.json";

// PNG-urile generate din all-layers.psd cu pozitii absolute pastrate.
// Fiecare PNG e docW x docH (1400x650) cu butonul plasat la
// coordonatele lui originale din Photoshop. Astfel suprapunerea a
// mai multor PNG-uri intr-un singur container reconstruieste EXACT
// aspectul PSD-ului tau (inclusiv distantele intre butoane si
// aliniamentul vertical).
import loopOffUrl  from "../assets/graphics/svg/all/loop-off.png";
import loopOnUrl   from "../assets/graphics/svg/all/loop-on.png";
import pauseOffUrl from "../assets/graphics/svg/all/pause-off.png";
import playOnUrl   from "../assets/graphics/svg/all/play-on.png";
import stopOffUrl  from "../assets/graphics/svg/all/stop-off.png";
import stopOnUrl   from "../assets/graphics/svg/all/stop-on.png";

/*
 * TransportButtons
 *
 * Reda cele 3 butoane Loop / Play-Pause / Stop EXACT cu layout-ul din
 * PSD-ul all-layers.psd construit de user in Photoshop. Nu re-aranjeaza
 * nimic — pastreaza pixel-perfect distantele si aliniamentul vertical
 * ale layer-elor din PSD.
 *
 * Cum functioneaza:
 *   - Container = "stage" cu dimensiunea PSD-ului (1400x650) scalata
 *     uniform la inaltimea `height` primita ca prop.
 *   - Cele 6 imagini (loop-off/on, pause-off, play-on, stop-off/on)
 *     sunt asezate ca layere absolute peste stage, fiecare acoperind
 *     TOT stage-ul (1400x650). Fiecare PNG contine butonul la
 *     coordonatele lui originale din PSD, restul e transparent.
 *   - Toggle intre off/on se face setand `display: none` pe imaginea
 *     inactiva -> singurul lucru care se schimba e ce layer e vizibil,
 *     iar butoanele raman aliniate perfect (aceleasi canvas-uri).
 *   - Peste imagini punem 3 <button> transparente, fiecare pozitionat
 *     la bbox-ul UNIUNE (off + on) al butonului corespunzator, ca sa
 *     capteze click-urile. Bbox-urile provin din positions.json.
 */

export type TransportButtonsProps = {
  loopActive: boolean;
  isPlaying: boolean;
  isPaused: boolean;    // NOTA: in pauza afisam pause-off (la fel ca STOP)
  stopFlashOn: boolean; // 400ms flash cu stop-on la click pe Stop

  onLoopClick: () => void;
  onPlayPauseClick: () => void;
  onStopClick: () => void;

  /** Inaltimea vizuala a intregii bare de transport in pixeli.
      Latimea rezulta din raportul PSD-ului (1400/650). Default 110. */
  height?: number;
};

export function TransportButtons({
  loopActive,
  isPlaying,
  isPaused,
  stopFlashOn,
  onLoopClick,
  onPlayPauseClick,
  onStopClick,
  height = 110,
}: TransportButtonsProps) {
  const docW = positions.docW;
  const docH = positions.docH;
  const scale = height / docH;
  const stageW = Math.round(docW * scale);
  const stageH = Math.round(docH * scale);

  // Bbox-uri REUNIUNE per pereche off+on, in coordonate PSD.
  // Le folosim ca hit-zone pentru cele 3 <button> transparente.
  const L_off = positions.layers["loop-off"];
  const L_on  = positions.layers["loop-on"];
  const P_off = positions.layers["pause-off"];
  const P_on  = positions.layers["play-on"];
  const S_off = positions.layers["stop-off"];
  const S_on  = positions.layers["stop-on"];

  const bbox = (
    a: { left: number; top: number; w: number; h: number },
    b: { left: number; top: number; w: number; h: number }
  ) => {
    const l = Math.min(a.left, b.left);
    const t = Math.min(a.top, b.top);
    const r = Math.max(a.left + a.w, b.left + b.w);
    const btm = Math.max(a.top + a.h, b.top + b.h);
    return { left: l, top: t, w: r - l, h: btm - t };
  };
  const loopBbox = bbox(L_off, L_on);
  const playBbox = bbox(P_off, P_on);
  const stopBbox = bbox(S_off, S_on);

  // Grafica activa pentru Play/Pause (user explicit):
  //   isPlaying=true              -> play-on
  //   isPlaying=false (STOP/PAUZA) -> pause-off  (in pauza NU folosim pause-on)
  void isPaused; // consumat prin isPlaying — pastrat pentru semantica API
  const showPlayOn = isPlaying;
  const showPauseOff = !isPlaying;

  // Grafica Stop (user explicit):
  //   stopFlashOn=true (400ms dupa click) -> stop-on
  //   altfel -> stop-off
  const showStopOn = stopFlashOn;
  const showStopOff = !stopFlashOn;

  // Grafica Loop:
  //   loopActive=true  -> loop-on
  //   loopActive=false -> loop-off
  const showLoopOn = loopActive;
  const showLoopOff = !loopActive;

  // Stil comun pentru <img>-urile de layer: acopera tot stage-ul (pentru
  // ca fiecare PNG e docW x docH, cu butonul la coordonatele originale).
  const layerImgStyle: React.CSSProperties = {
    position: "absolute",
    left: 0,
    top: 0,
    width: stageW,
    height: stageH,
    userSelect: "none",
    pointerEvents: "none",
  };
  const hide: React.CSSProperties = { ...layerImgStyle, display: "none" };

  // Hit-zone <button> transparent peste un bbox PSD, scalat la stage.
  const hitStyle = (b: { left: number; top: number; w: number; h: number }): React.CSSProperties => ({
    position: "absolute",
    left: Math.round(b.left * scale),
    top: Math.round(b.top * scale),
    width: Math.round(b.w * scale),
    height: Math.round(b.h * scale),
    background: "transparent",
    border: "none",
    padding: 0,
    margin: 0,
    cursor: "pointer",
    zIndex: 10,
  });

  return (
    <div
      style={{
        position: "relative",
        width: stageW,
        height: stageH,
        flexShrink: 0,
        // Fundal transparent — sectiunea Builder e deja pe #677987,
        // deci butoanele se lipesc pe fundalul acela fara margin extra.
      }}
      aria-label="Transport controls (Loop / Play/Pause / Stop)"
    >
      {/* Layere PNG suprapuse, fiecare docW x docH scalat la stage. */}
      <img src={loopOffUrl}  alt="" style={showLoopOff  ? layerImgStyle : hide} draggable={false} />
      <img src={loopOnUrl}   alt="" style={showLoopOn   ? layerImgStyle : hide} draggable={false} />
      <img src={pauseOffUrl} alt="" style={showPauseOff ? layerImgStyle : hide} draggable={false} />
      <img src={playOnUrl}   alt="" style={showPlayOn   ? layerImgStyle : hide} draggable={false} />
      <img src={stopOffUrl}  alt="" style={showStopOff  ? layerImgStyle : hide} draggable={false} />
      <img src={stopOnUrl}   alt="" style={showStopOn   ? layerImgStyle : hide} draggable={false} />

      {/* Hit-zone transparente pentru click. Pozitionate pe bbox-ul
          REUNIUNE off+on al fiecarui buton (in coordonate PSD, scalate
          la stage). */}
      <button
        type="button"
        onClick={onLoopClick}
        style={hitStyle(loopBbox)}
        title={loopActive ? "Loop ON — click pentru dezactivare" : "Loop OFF — click pentru activare (redare in loop)"}
        aria-label={loopActive ? "Loop On" : "Loop Off"}
      />
      <button
        type="button"
        onClick={onPlayPauseClick}
        style={hitStyle(playBbox)}
        title={
          isPaused ? "Resume playback from current position" :
          isPlaying ? "Pause playback (playhead stays put)" :
          "Play the progression"
        }
        aria-label={isPaused ? "Resume" : isPlaying ? "Pause" : "Play"}
      />
      <button
        type="button"
        onClick={onStopClick}
        style={hitStyle(stopBbox)}
        title="Stop playback: reseteaza playhead la 0 si dezactiveaza Loop"
        aria-label="Stop"
      />
    </div>
  );
}

export default TransportButtons;
