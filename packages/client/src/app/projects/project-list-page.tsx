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
import SearchBox from "@/components/search-box";
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
import { Pencil } from "lucide-react";
import { authentication_strategy, schemas } from "aloha-shared";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { deleteProject, getProjectsList } from "../../services/projects";
import ProjectForm from "./project-form";
import { usePermissionChecker } from "@/hooks/use-permission-checker";
import { TagsList } from "@/components/tags-list";

const projectPredicate = (p: schemas.ProjectWithId, search: string) => {
  return search
    .toLowerCase()
    .split(" ")
    .some(
      (f) =>
        p.name.toLowerCase().includes(f) ||
        p.projectId.toLowerCase().includes(f) ||
        (p.tags && p.tags.some((t) => t.toLowerCase().includes(f)))
    );
};

function DeleteButton({
  projectId,
  canManageProjects,
  onDeleted,
}: {
  projectId: string;
  canManageProjects: boolean;
  onDeleted: () => void;
}) {
  return (
    <ConfirmDialog
      onClick={async () => {
        try {
          await deleteProject(projectId);
          onDeleted();
        } catch (error) {
          console.error(error);
          toast.error("There was an error while deleting the project");
        }
      }}
    >
      <Button
        variant="destructive"
        size="icon"
        disabled={!canManageProjects}
        data-testid="delete-project-button-witness"
      >
        <TrashIcon />
      </Button>
    </ConfirmDialog>
  );
}

function EditButton({
  projectId,
  canManageProjects,
  onEdited,
}: {
  projectId: string;
  canManageProjects: boolean;
  onEdited: () => Promise<void>;
}) {
  return (
    <ProjectForm projectId={projectId} onAccept={onEdited}>
      <Button
        size="icon"
        className="mr-2"
        variant="default"
        disabled={!canManageProjects}
        data-testid="edit-project-button-witness"
      >
        <Pencil />
      </Button>
    </ProjectForm>
  );
}

function NewButton({
  canManageProjects,
  onCreated,
}: {
  canManageProjects: boolean;
  onCreated: () => Promise<void>;
}) {
  return (
    <ProjectForm projectId={undefined} onAccept={onCreated}>
      <Button
        variant="default"
        disabled={!canManageProjects}
        data-testid="new-project-button-witness"
      >
        <DocumentPlusIcon /> New Project
      </Button>
    </ProjectForm>
  );
}

export default function ProjectsListPage() {
  const [filteredProjects, setFilteredProjects] = useState<
    schemas.ProjectWithId[] | null
  >(null);
  const [requestRefresh, setRequestRefresh] = useState(0);

  const [isLoading, projects] = useService(
    getProjectsList,
    [requestRefresh],
    []
  );
  const permissionChecker = usePermissionChecker();

  const canManageProjects = useMemo(() => {
    return (
      permissionChecker.isAdministrator() ||
      permissionChecker.has(authentication_strategy.Permissions.UsersWrite)
    );
  }, [permissionChecker]);

  const refreshList = useCallback(() => {
    setRequestRefresh((r) => r + 1);
  }, []);

  const displayedProjects = filteredProjects ?? projects;

  return (
    <div className="max-w-8xl mx-auto" data-testid="project-list-page-witness">
      {/* Page Header */}
      <div className="mb-8">
        <div className="flex justify-between items-center mb-6">
          <PageTitle className="text-2xl font-bold text-gray-900">
            Projects
          </PageTitle>
          <NewButton
            canManageProjects={canManageProjects}
            onCreated={async () => refreshList()}
          />
        </div>

        {/* Search and Filter */}
        <SearchBox
          items={projects}
          predicate={projectPredicate}
          onFilter={setFilteredProjects}
          placeholder="Search projects..."
        />
      </div>

      <div className="flex flex-wrap gap-8">
        <Table className="w-full">
          <TableCaption>Projects list</TableCaption>
          <TableHeader>
            <TableRow>
              <TableHead className="text-left w-1/12">Project ID</TableHead>
              <TableHead className="text-left w-1/6">Name</TableHead>
              <TableHead className="text-left w-auto">Description</TableHead>
              <TableHead className="text-left w-1/6">Tags</TableHead>
              <TableHead className="text-center w-1/6">Actions</TableHead>
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
            {projects.length > 0 &&
              displayedProjects.map((project) => (
                <TableRow key={project.id}>
                  <TableCell
                    className="text-left w-1/12"
                    data-testid="project-id-witness"
                  >
                    {project.projectId}
                  </TableCell>
                  <TableCell className="text-left w-1/6">
                    {project.name}
                  </TableCell>
                  <TableCell className="w-auto whitespace-break-spaces">
                    {project.description}
                  </TableCell>
                  <TableCell className="text-left w-1/6">
                    <TagsList item={project} inline={true} />
                  </TableCell>
                  <TableCell className="text-center w-1/6">
                    <EditButton
                      projectId={project.id}
                      canManageProjects={canManageProjects}
                      onEdited={async () => refreshList()}
                    />
                    <DeleteButton
                      projectId={project.id}
                      canManageProjects={canManageProjects}
                      onDeleted={refreshList}
                    />
                  </TableCell>
                </TableRow>
              ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
