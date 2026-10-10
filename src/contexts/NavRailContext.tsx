import React, { createContext, useContext, useState, useCallback } from 'react';

interface NavRailState {
  /** true = expanded panel with labels (desktop), false = collapsed icon rail */
  expanded: boolean;
  toggle: () => void;
  setExpanded: (v: boolean) => void;
}

const NavRailContext = createContext<NavRailState>({
  expanded: false,
  toggle: () => {},
  setExpanded: () => {},
});

export const useNavRail = () => useContext(NavRailContext);

export const NavRailProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [expanded, setExpanded] = useState(false);
  const toggle = useCallback(() => setExpanded((v) => !v), []);
  return (
    <NavRailContext.Provider value={{ expanded, toggle, setExpanded }}>
      {children}
    </NavRailContext.Provider>
  );
};
