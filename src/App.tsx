/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import Dashboard from './components/Dashboard';
import PlatformGate from './components/PlatformGate';

export default function App() {
  return (
    <PlatformGate>
      <Dashboard />
    </PlatformGate>
  );
}
