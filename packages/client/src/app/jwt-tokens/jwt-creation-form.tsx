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

import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Form,
  FormControl,
  FormDescription,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useService } from "@/hooks/use-service";
import { cn } from "@/lib/utils";
import {
  CalendarIcon,
  DocumentCheckIcon,
  ArrowDownTrayIcon,
  ShieldCheckIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/16/solid";
import { Copy, Check } from "lucide-react";
import { zodResolver } from "@hookform/resolvers/zod";
import { addYears, format } from "date-fns";
import { ReactNode, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { getProjectsList } from "../../services/projects";
import { createToken } from "../../services/tokens";
import { exceptionToMessage } from "../../utils/type-utils";

const CreateTokenSchema = z.object({
  project: z.string().min(1, "Please select a project"),
  expirationDate: z.date({
    error: "Please select an expiration date",
  }),
});

type CreateToken = z.infer<typeof CreateTokenSchema>;

type Props = {
  onAccept: () => Promise<void>;
  children: ReactNode;
};

// Token Copy Component
interface TokenCopyProps {
  token: string;
  className?: string;
}

function TokenCopy({ token, className = "" }: TokenCopyProps) {
  const [copied, setCopied] = useState(false);

  const copyToClipboard = async () => {
    try {
      if (!token) return;
      await navigator.clipboard.writeText(token);
      setCopied(true);
      toast.success("Token copied to clipboard");

      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error(err);
      toast.error("Failed to copy token");
    }
  };

  return (
    <div className={`relative ${className}`}>
      <div className="flex h-20 w-full rounded-md border border-input bg-background">
        <div className="flex-1 overflow-hidden">
          <div className="h-full overflow-x-auto overflow-y-hidden px-3 py-2">
            <code className="text-sm font-mono text-muted-foreground leading-6 break-all">
              {token}
            </code>
          </div>
        </div>
        <Button
          variant="ghost"
          size="sm"
          onClick={copyToClipboard}
          className="h-20 w-12 shrink-0 rounded-l-none border-l"
        >
          {copied ? (
            <Check className="h-4 w-4 text-green-600" />
          ) : (
            <Copy className="h-4 w-4" />
          )}
        </Button>
      </div>
    </div>
  );
}

export default function JWTCreationForm({ onAccept, children }: Props) {
  const [dialogOpen, setDialogOpen] = useState<boolean>(false);
  const [currentStep, setCurrentStep] = useState<"form" | "success">("form");

  const [isLoadingProjects, projects] = useService(
    getProjectsList,
    [],
    [],
    [dialogOpen]
  );

  const [token, setToken] = useState<string | null>(null);

  const form = useForm<CreateToken>({
    resolver: zodResolver(CreateTokenSchema),
    defaultValues: {
      project: "",
      expirationDate: addYears(new Date(), 1),
    },
  });

  async function onSubmit(values: CreateToken) {
    try {
      const newToken = await createToken(
        values.project,
        format(values.expirationDate, "yyyy-MM-dd")
      );
      if (newToken) {
        setToken(newToken);
        setCurrentStep("success");
        await onAccept();
      } else {
        toast.error("Unknown error occurred");
      }
    } catch (e) {
      console.error(e);
      toast.error(`Error while creating the token: ${exceptionToMessage(e)}`);
    }
  }

  const downloadToken = () => {
    if (token) {
      const element = document.createElement("a");
      const file = new Blob([token], { type: "text/plain" });
      element.href = URL.createObjectURL(file);
      element.download = "jwt-token.txt";
      document.body.appendChild(element);
      element.click();
      document.body.removeChild(element);
      toast.success("Token downloaded!");
    }
  };

  const resetDialog = () => {
    form.reset({
      project: "",
      expirationDate: addYears(new Date(), 1),
    });
    setToken(null);
    setCurrentStep("form");
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      resetDialog();
    }
  };

  const now = new Date();
  const nextYear = addYears(now, 1);

  return (
    <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
      <DialogTrigger asChild onClick={resetDialog}>
        {children}
      </DialogTrigger>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <ShieldCheckIcon className="h-5 w-5 text-blue-600" />
            {currentStep === "form"
              ? "Create JWT Bearer Token"
              : "Token Created Successfully"}
          </DialogTitle>
          {isLoadingProjects && (
            <div className="text-sm text-muted-foreground">
              Loading projects...
            </div>
          )}
        </DialogHeader>

        {currentStep === "success" && token && (
          <div className="space-y-4">
            <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-4">
              <div className="flex items-start gap-3">
                <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600 mt-0.5 flex-shrink-0" />
                <div>
                  <h4 className="font-medium text-yellow-800">
                    Important Security Notice
                  </h4>
                  <p className="text-sm text-yellow-700 mt-1">
                    This token is not stored on the server. Please save it
                    securely as you won't be able to view it again.
                  </p>
                </div>
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium text-gray-700">
                Your JWT Token:
              </label>
              <TokenCopy token={token} />
            </div>

            <DialogFooter className="flex-col sm:flex-row gap-2">
              <DialogClose asChild>
                <Button variant="outline" className="w-full sm:w-auto">
                  Close
                </Button>
              </DialogClose>
              <Button
                onClick={downloadToken}
                className="w-full sm:w-auto bg-emerald-600 hover:bg-emerald-700"
              >
                <ArrowDownTrayIcon className="h-4 w-4 mr-2" />
                Download
              </Button>
            </DialogFooter>
          </div>
        )}

        {currentStep === "form" && (
          <Form {...form}>
            <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
              <FormField
                control={form.control}
                name="project"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Project *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      value={field.value}
                      disabled={isLoadingProjects}
                    >
                      <FormControl>
                        <SelectTrigger className="w-full">
                          <SelectValue placeholder="Select a project" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {projects?.map((project) => (
                          <SelectItem
                            value={project.projectId}
                            key={project.id}
                          >
                            {project.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormDescription>
                      Choose the project this token will have access to
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="expirationDate"
                render={({ field }) => (
                  <FormItem className="flex flex-col">
                    <FormLabel>Expiration Date *</FormLabel>
                    <Popover modal={true}>
                      <PopoverTrigger asChild>
                        <FormControl>
                          <Button
                            variant="outline"
                            className={cn(
                              "w-full pl-3 text-left font-normal",
                              !field.value && "text-muted-foreground"
                            )}
                            disabled={isLoadingProjects}
                          >
                            {field.value ? (
                              format(field.value, "PPP")
                            ) : (
                              <span>Select expiration date</span>
                            )}
                            <CalendarIcon className="ml-auto h-4 w-4 opacity-50" />
                          </Button>
                        </FormControl>
                      </PopoverTrigger>
                      <PopoverContent className="w-auto p-0" align="start">
                        <Calendar
                          mode="single"
                          selected={field.value}
                          onSelect={field.onChange}
                          disabled={(date) => date > nextYear || date < now}
                          initialFocus
                        />
                      </PopoverContent>
                    </Popover>
                    <FormDescription>
                      Token will expire on this date (maximum 1 year from now)
                    </FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <DialogFooter className="flex-col sm:flex-row gap-2">
                <DialogClose asChild>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full sm:w-auto"
                  >
                    Cancel
                  </Button>
                </DialogClose>
                <Button
                  type="submit"
                  disabled={form.formState.isSubmitting || isLoadingProjects}
                  className="w-full sm:w-auto"
                >
                  <DocumentCheckIcon className="h-4 w-4 mr-2" />
                  {form.formState.isSubmitting
                    ? "Creating Token..."
                    : "Create Token"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
