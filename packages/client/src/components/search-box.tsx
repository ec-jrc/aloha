import { SearchIcon, XIcon } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";

import { ButtonGroup } from "./ui/button-group";
import { Button } from "./ui/button";
import { Input } from "./ui/input";

type SearchBoxProps<T> = {
  items: T[];
  predicate: (item: T, search: string) => boolean;
  onFilter: (filtered: T[]) => void;
  placeholder?: string;
  debounceMs?: number;
};

export default function SearchBox<T>({
  items,
  predicate,
  onFilter,
  placeholder = "Search...",
  debounceMs = 300,
}: SearchBoxProps<T>) {
  const [search, setSearch] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const applyFilter = useCallback(
    (value: string) => {
      if (!value) {
        onFilter(items);
        return;
      }
      const filtered = items.filter((item) => predicate(item, value));
      onFilter(filtered);
    },
    [items, onFilter, predicate]
  );

  const handleChange = useCallback(
    (value: string) => {
      setSearch(value);
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      debounceRef.current = setTimeout(() => {
        applyFilter(value);
      }, debounceMs);
    },
    [applyFilter, debounceMs]
  );

  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  useEffect(() => {
    applyFilter(search);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items]);

  return (
    <ButtonGroup className="w-full">
      <Input
        ref={inputRef}
        placeholder={placeholder}
        className="bg-white w-full border border-black"
        value={search}
        onChange={(e) => handleChange(e.target.value)}
      />
      {search ? (
        <Button
          variant="outline"
          aria-label="Clear search"
          onClick={() => {
            setSearch("");
            if (debounceRef.current) {
              clearTimeout(debounceRef.current);
            }
            applyFilter("");
            inputRef.current?.focus();
          }}
        >
          <XIcon />
        </Button>
      ) : (
        <Button variant="outline" aria-label="Search">
          <SearchIcon />
        </Button>
      )}
    </ButtonGroup>
  );
}
