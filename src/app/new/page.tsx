import { CreateThreadForm } from "@/components/create-thread-form";

export default function NewThreadPage() {
  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-white">New Thread</h2>
      <CreateThreadForm />
    </div>
  );
}
