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

import ConfirmDialog from "@/components/confirm-dialog";
import PageTitle from "@/components/page-title";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useService } from "@/hooks/use-service";
import { DocumentPlusIcon, TrashIcon } from "@heroicons/react/16/solid";
import { format } from "date-fns";
import { useCallback, useState } from "react";
import { toast } from "sonner";
import { disableToken, getTokensList } from "../../services/tokens";
import { exceptionToMessage } from "../../utils/type-utils";
import JWTCreationForm from "./jwt-creation-form";

const ROWS_PER_PAGE = 25;

export default function JWTTokensListPage() {
  const [page, setPage] = useState<number>(1);
  const [requestRefreshList, setRequestRefreshList] = useState(0);

  const [isLoading, tokens] = useService(
    getTokensList,
    [requestRefreshList],
    []
  );

  const handleChangePage = (
    _event: React.MouseEvent<HTMLButtonElement>,
    newPage: number
  ) => {
    setPage(newPage);
  };

  const CancelTokenButton = useCallback(
    ({ tokenId }: { tokenId: string }) => {
      return (
        <ConfirmDialog
          onClick={async () => {
            try {
              await disableToken(tokenId);
              setRequestRefreshList(requestRefreshList + 1);
            } catch (e) {
              toast.error(
                `Error while disabling the token: ${exceptionToMessage(e)}`
              );
            }
          }}
        >
          <Button
            size="icon"
            variant="destructive"
            data-testid="disable-token-button-witness"
          >
            <TrashIcon />
          </Button>
        </ConfirmDialog>
      );
    },
    [requestRefreshList]
  );

  return (
    <div data-testid="jwt-token-list-page-witness">
      <div className="flex justify-between items-center mb-4">
        <PageTitle>JWT access tokens</PageTitle>
        <JWTCreationForm
          onAccept={async () => {
            setRequestRefreshList(requestRefreshList + 1);
          }}
        >
          <Button data-testid="new-token-button-witness">
            <DocumentPlusIcon />
            New JWT token
          </Button>
        </JWTCreationForm>
      </div>
      <p className="mb-4">
        Use these tokens to connect to Aloha via machine‑to‑machine
        communication (e.g., from an agent).
      </p>

      <div className="flex flex-wrap gap-8">
        <Table className="w-full">
          <TableCaption>JWT Tokens list</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left">Project Name</TableHead>
              <TableHead className="text-left">Creator Name</TableHead>
              <TableHead className="text-left">Expiry date</TableHead>
              <TableHead className="text-left">Permissions</TableHead>
              <TableHead className="text-center">Actions</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {isLoading && (
              <TableRow>
                <TableCell colSpan={5} className="text-center">
                  Loading...
                </TableCell>
              </TableRow>
            )}
            {!isLoading &&
              tokens
                .sort(
                  (a, b) =>
                    a.expirationDate.getTime() - b.expirationDate.getTime()
                )
                .slice((page - 1) * ROWS_PER_PAGE, page * ROWS_PER_PAGE)
                .map((token) => (
                  <TableRow key={token.id}>
                    <TableCell
                      className={token.disabled ? "italic text-gray-600" : ""}
                      data-testid="token-project-witness"
                    >
                      {token.projectName}
                    </TableCell>
                    <TableCell
                      className={token.disabled ? "italic text-gray-600" : ""}
                    >
                      {token.creatorName}
                    </TableCell>
                    <TableCell
                      className={token.disabled ? "italic text-gray-600" : ""}
                    >
                      {format(token.expirationDate, "yyyy-MM-dd")}
                    </TableCell>
                    <TableCell
                      className={`text-sm opacity-70 mb-2 ${token.disabled ? "italic text-gray-600" : ""}`}
                    >
                      {token.permissions.join(", ")}
                    </TableCell>
                    <TableCell className="text-center">
                      {!token.disabled ? (
                        <CancelTokenButton tokenId={token.id} />
                      ) : (
                        <span className="italic text-gray-600">DISABLED</span>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
          </TableBody>
        </Table>
      </div>
      {tokens.length > ROWS_PER_PAGE && (
        <div className="flex justify-center mt-4">
          <Button
            onClick={(event) => handleChangePage(event, page - 1)}
            disabled={page === 1}
            className="mr-2"
          >
            Previous
          </Button>
          <Button
            onClick={(event) => handleChangePage(event, page + 1)}
            disabled={page * ROWS_PER_PAGE >= tokens.length}
          >
            Next
          </Button>
        </div>
      )}
    </div>
  );
}
