/*
Copyright (C) 2025 European Union
 
Licensed under the EUPL, Version 1.2 or – as soon they will be approved by the
European Commission – subsequent versions of the EUPL (the “Licence”);
You may not use this work except in compliance with the Licence.
You may obtain a copy of the Licence at:
* https://joinup.ec.europa.eu/collection/eupl/eupl-text-eupl-12 *

Unless required by applicable law or agreed to in writing, software distributed under
the Licence is distributed on an “AS IS” basis, WITHOUT WARRANTIES OR CONDITIONS
OF ANY KIND, either express or implied. See the Licence for the specific language
governing permissions and limitations under the Licence.
*/

/**
 * Based on https://www.bradenmacdonald.com/articles/creating-a-ui-plugin-framework
 * UiSlot.tsx by Braden MacDonald
 * @copyright (c) 2023 MacDonald Thoughtstuff Inc.
 * @license Unlicense (see https://unlicense.org/ - public domain, use as you will, but no warranty of any kind)
 */

/* eslint-disable react-refresh/only-export-components */

import React from "react";
import { UIChangeOperation, UIPluginDefinition } from "./ui-slot-plugin";
import { UISlotWidget } from "./ui-slot-widget";

/** Props accepted by <UISlot/> */
interface Props<ContentType = React.ReactElement> {
  defaultContents?: readonly UISlotWidget<ContentType>[];
  slotId: string;
  context: unknown;
  renderWidget: (widget: UISlotWidget<ContentType>) => React.ReactElement;
}

/**
 * A UI slot is a placeholder in the user interface that can be filled with various content/widgets, and in particular
 * which plugins can modify.
 */
export const UISlot = function <ContentType = React.ReactElement>(
  props: Props<ContentType>
) {
  // Allow any plugins that are active for this site to modify this UI slot:
  const enabledPlugins = React.useContext(UiPluginsContext);

  const contents = React.useMemo(() => {
    const contents: (UISlotWidget<ContentType> & {
      wrappers?: React.FC<{ widget: React.ReactElement }>[];
    })[] = [...(props.defaultContents ?? [])];
    for (const p of enabledPlugins) {
      if (!p.getUiSlotChanges) {
        continue;
      }
      const changes = p.getUiSlotChanges(props.context); // Optional: Pass in any app-specific context that the plugin may want
      for (const change of changes[props.slotId] ?? []) {
        if (change.op === UIChangeOperation.Insert) {
          contents.push(change.widget as UISlotWidget<ContentType>);
        } else if (change.op === UIChangeOperation.Hide) {
          const widget = contents.find((w) => w.id === change.widgetId);
          if (widget) {
            widget.hidden = true;
          }
        } else if (change.op === UIChangeOperation.Modify) {
          const widgetIdx = contents.findIndex((w) => w.id === change.widgetId);
          if (widgetIdx >= 0) {
            const widget = { ...contents[widgetIdx] };
            contents[widgetIdx] = change.fn(
              widget
            ) as UISlotWidget<ContentType>;
          }
        } else if (change.op === UIChangeOperation.Wrap) {
          const widgetIdx = contents.findIndex((w) => w.id === change.widgetId);
          if (widgetIdx >= 0) {
            const newWidget = { wrappers: [], ...contents[widgetIdx] };
            newWidget.wrappers.push(
              change.wrapper as React.FC<{ widget: React.ReactElement }>
            );
            contents[widgetIdx] = newWidget;
          }
        } else {
          // throw new Error(`unknown plugin UI change operation: ${change.op}`);
        }
      }
    }
    // Sort first by priority, then by ID
    contents.sort(
      (a, b) => (a.priority - b.priority) * 10_000 + a.id.localeCompare(b.id)
    );
    return contents;
  }, [props.defaultContents, enabledPlugins, props.slotId, props.context]);

  return (
    <>
      {contents.map((c) =>
        c.hidden
          ? null
          : c.wrappers
            ? c.wrappers.reduce(
                (widget, wrapper) =>
                  React.createElement(wrapper, { widget, key: c.id }),
                props.renderWidget(c)
              )
            : props.renderWidget(c)
      )}
    </>
  );
};

/**
 * Default "render" method for a <UiSlot>.
 * Assumes "content" is a React component and just renders it normally.
 */
export const defaultRender = (widget: UISlotWidget<React.ReactElement>) => (
  <React.Fragment key={widget.id}>{widget.content}</React.Fragment>
);

/**
 * A UI slot is a placeholder in the user interface that can be filled with various content/widgets, and in particular
 * which plugins can modify. This particular type of UI slot just wraps any React component and allows plugins to insert
 * HTML before it or after it, or to hide it.
 */
export const DefaultUISlot: React.FunctionComponent<{
  slotId: string;
  context: unknown;
  children?: React.ReactNode;
}> = (props) => {
  return (
    <UISlot
      context={props.context}
      slotId={props.slotId}
      renderWidget={defaultRender}
      defaultContents={
        props.children
          ? [
              {
                id: "content",
                priority: 50,
                content: <>{props.children}</>,
              },
            ]
          : []
      }
    />
  );
};

/** Context which makes the list of enabled plugins available to the <UISlot> components below it in the React tree */
export const UiPluginsContext = React.createContext<UIPluginDefinition[]>([]);
