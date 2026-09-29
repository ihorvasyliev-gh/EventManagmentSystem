import type jsPDF from 'jspdf';

/** Resource name the marked-content operators refer to */
const OC_NAME = 'OCScreen';

interface JsPdfInternals {
  events: { subscribe: (topic: string, callback: (...args: unknown[]) => void) => unknown };
  newObject: () => number;
  write: (value: string) => void;
}

/**
 * Adds a PDF optional-content layer (OCG) that viewers show on screen but leave out
 * when printing: /View /ViewState /ON, /Print /PrintState /OFF, applied automatically
 * through the /AS usage events. Honoured by Chrome/Edge, Firefox and Acrobat.
 *
 * Wrap drawing calls in `screenOnly(() => …)`. Link annotations stay clickable on
 * screen; they have no appearance of their own so nothing of them prints either.
 */
export const createScreenOnlyLayer = (doc: jsPDF) => {
  const internal = doc.internal as unknown as JsPdfInternals;
  let used = false;
  let ocgId = 0;

  let hookedXobjectDict = false;

  // The layer object has to exist before the shared resource dictionary refers to it
  internal.events.subscribe('putResources', () => {
    if (!used) return;
    ocgId = internal.newObject();
    internal.write('<< /Type /OCG /Name (Add-to-calendar buttons \\(screen only\\))');
    internal.write('/Usage << /View << /ViewState /ON >> /Print << /PrintState /OFF >> >> >>');
    internal.write('endobj');

    // jsPDF has no hook for extra resource categories; "putXobjectDict" fires inside
    // "/XObject << … >>", so close that dictionary, open /Properties and let jsPDF's own
    // closing ">>" end it. Subscribing only now keeps this after the addImage plugin,
    // which subscribes on the first image and must list the images before we close.
    if (!hookedXobjectDict) {
      hookedXobjectDict = true;
      internal.events.subscribe('putXobjectDict', () => {
        internal.write(`>> /Properties << /${OC_NAME} ${ocgId} 0 R`);
      });
    }
  });

  internal.events.subscribe('putCatalog', () => {
    if (!used) return;
    const ref = `${ocgId} 0 R`;
    internal.write(
      `/OCProperties << /OCGs [${ref}] /D << /Name (Default) /ON [${ref}] /OFF [] /Order [${ref}] ` +
      `/AS [<< /Event /View /OCGs [${ref}] /Category [/View] >> << /Event /Print /OCGs [${ref}] /Category [/Print] >>] >> >>`
    );
  });

  return function screenOnly(draw: () => void) {
    used = true;
    internal.write(`/OC /${OC_NAME} BDC`);
    try {
      draw();
    } finally {
      internal.write('EMC');
    }
  };
};
