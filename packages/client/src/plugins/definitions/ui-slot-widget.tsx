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

import React from "react";

/** Some widget that appears in a UI slot */
export interface UISlotWidget<ContentType = React.ReactElement> {
  id: string;
  content: ContentType;
  priority: number; // Priority, 0 comes first, 100 comes last
  hidden?: boolean; // If a widget in a slot is hidden, it won't be rendered at all.
}
